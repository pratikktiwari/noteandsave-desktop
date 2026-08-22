import { BrowserWindow, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';

import { getSetting, setSetting } from './database';
import { FileWorkspace, replaceWorkspaceDirectory } from './file-workspace';
import { parseFolder, parseNote, parseWhiteboard, serializeFolder, serializeNote, serializeWhiteboard } from './workspace-codec';
import {
  getStorageStatus,
  getWorkspaceGeneration,
  isRendererDirty,
  setWorkspaceChangeListener,
} from './workspace-service';
import type { JsonValue, Note } from '../shared/workspace';

export type SyncState = 'unlinked' | 'idle' | 'dirty' | 'syncing' | 'conflict' | 'error';

export interface GitSyncStatus {
  state: SyncState;
  repositoryUrl: string | null;
  branch: string | null;
  syncIntervalMinutes: number;
  lastSyncedAt: number | null;
  error: string | null;
  conflictCount: number;
}

export interface LinkRepositoryInput {
  repositoryUrl: string;
  branch?: string;
  token: string;
}

interface StoredGitConfig {
  repositoryUrl: string;
  branch: string;
  encryptedToken: string;
  syncIntervalMinutes?: number;
  lastSyncedAt: number | null;
}

class SyncCancelledError extends Error {}
class SyncDeferredError extends Error {}

const CONFIG_KEY = 'git_sync_config';
const SYNC_DEBOUNCE_MS = 3_000;
export const DEFAULT_SYNC_INTERVAL_MINUTES = 5;
const MIN_SYNC_INTERVAL_MINUTES = 1;
const MAX_SYNC_INTERVAL_MINUTES = 24 * 60;
const CONTENT_DIRECTORIES = ['notes', 'folders', 'whiteboards', 'assets'];

let config: StoredGitConfig | null = null;
let status: GitSyncStatus = {
  state: 'unlinked',
  repositoryUrl: null,
  branch: null,
  syncIntervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
  lastSyncedAt: null,
  error: null,
  conflictCount: 0,
};
let syncPromise: Promise<GitSyncStatus> | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let linkAttemptId = 0;

const emitStatus = (): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('gitSync:status', status);
  }
};

const updateStatus = (updates: Partial<GitSyncStatus>): GitSyncStatus => {
  status = { ...status, ...updates };
  emitStatus();
  return status;
};

export const normalizeSyncIntervalMinutes = (value: unknown): number =>
  typeof value === 'number'
    && Number.isInteger(value)
    && value >= MIN_SYNC_INTERVAL_MINUTES
    && value <= MAX_SYNC_INTERVAL_MINUTES
    ? value
    : DEFAULT_SYNC_INTERVAL_MINUTES;

const restartPeriodicTimer = (): void => {
  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = setInterval(() => {
    if (config && status.state !== 'syncing') void syncGitNow();
  }, status.syncIntervalMinutes * 60 * 1000);
};

const sanitizeError = (error: unknown, extraSecrets: string[] = []): string => {
  let message = error instanceof Error ? error.message : String(error);
  const secrets = [...extraSecrets];
  if (!config?.encryptedToken) {
    for (const secret of secrets) if (secret) message = message.split(secret).join('[redacted]');
    return message;
  }
  try {
    secrets.push(decryptToken(config.encryptedToken));
    for (const secret of secrets) if (secret) message = message.split(secret).join('[redacted]');
    return message;
  } catch {
    return 'Git synchronization failed';
  }
};

const validateRepositoryUrl = (repositoryUrl: string): string => {
  const parsed = new URL(repositoryUrl);
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
    throw new Error('Use an HTTPS github.com repository URL');
  }
  if (parsed.username || parsed.password) throw new Error('Repository URLs must not contain credentials');
  parsed.hash = '';
  parsed.search = '';
  return parsed.toString().replace(/\/$/, '');
};

const encryptToken = (token: string): string => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure storage is unavailable; the GitHub token was not saved');
  }
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    throw new Error('A secure Linux keyring is required before a GitHub token can be saved');
  }
  return safeStorage.encryptString(token).toString('base64');
};

const decryptToken = (encryptedToken: string): string =>
  safeStorage.decryptString(Buffer.from(encryptedToken, 'base64'));

const auth = (token: string) => ({
  onAuth: () => ({ username: 'x-access-token', password: token }),
  onAuthFailure: () => ({ cancel: true }),
});

const copyDirectory = (source: string, destination: string): void => {
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (entry) => path.basename(entry) !== '.git',
  });
};

const contentFiles = (root: string): string[] => {
  const files: string[] = [];
  const walk = (relativeDirectory: string): void => {
    const directory = path.join(root, relativeDirectory);
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) walk(relativePath);
      else files.push(relativePath.split(path.sep).join('/'));
    }
  };
  for (const directory of CONTENT_DIRECTORIES) walk(directory);
  return files.sort((left, right) => left.localeCompare(right));
};

const readOptional = (root: string, relativePath: string): Buffer | null => {
  const filePath = path.join(root, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
};

const equalBuffers = (left: Buffer | null, right: Buffer | null): boolean =>
  left === null ? right === null : right !== null && left.equals(right);

const writeFile = (root: string, relativePath: string, content: Buffer | string): void => {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const removeFile = (root: string, relativePath: string): void => {
  const filePath = path.join(root, relativePath);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

const readBaseFiles = async (
  root: string,
  expectedRepositoryUrl: string,
  expectedBranch: string,
): Promise<Map<string, Buffer>> => {
  const files = new Map<string, Buffer>();
  if (!fs.existsSync(path.join(root, '.git'))) return files;
  const origin = await git.getConfig({ fs, dir: root, path: 'remote.origin.url' });
  const branch = await git.currentBranch({ fs, dir: root, fullname: false });
  if (origin !== expectedRepositoryUrl || branch !== expectedBranch) return files;
  let oid: string;
  try {
    oid = await git.resolveRef({ fs, dir: root, ref: 'HEAD' });
  } catch {
    return files;
  }
  const matrix = await git.statusMatrix({ fs, dir: root });
  for (const [filepath, head] of matrix) {
    if (head === 0 || !CONTENT_DIRECTORIES.some((directory) => filepath.startsWith(`${directory}/`))) continue;
    try {
      const result = await git.readBlob({ fs, dir: root, oid, filepath });
      files.set(filepath, Buffer.from(result.blob));
    } catch {
      // The file is new or was not present at the last synchronized commit.
    }
  }
  return files;
};

const replaceAssetReferences = (value: JsonValue, replacements: Map<string, string>): JsonValue => {
  if (Array.isArray(value)) return value.map((item) => replaceAssetReferences(item, replacements));
  if (!value || typeof value !== 'object') return value;
  const next: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    next[key] = typeof child === 'string' && replacements.has(child)
      ? replacements.get(child) as string
      : replaceAssetReferences(child, replacements);
  }
  return next;
};

interface ReconcileContext {
  suffix: string;
  folderIds: Map<string, string>;
  assetPaths: Map<string, string>;
  conflictCount: number;
}

interface ReconcileResult {
  conflictCount: number;
  remoteChangeCount: number;
}

const copyAsConflict = (
  liveRoot: string,
  stagingRoot: string,
  relativePath: string,
  context: ReconcileContext,
): void => {
  const source = fs.readFileSync(path.join(liveRoot, relativePath));
  if (relativePath.startsWith('assets/')) {
    const extension = path.extname(relativePath);
    const basename = path.basename(relativePath, extension);
    const conflictPath = `assets/${basename}-conflict-${context.suffix}${extension}`;
    writeFile(stagingRoot, conflictPath, source);
    context.assetPaths.set(
      `noteandsave-asset://${relativePath.slice('assets/'.length)}`,
      `noteandsave-asset://${conflictPath.slice('assets/'.length)}`,
    );
  } else if (relativePath.startsWith('folders/')) {
    const folder = parseFolder(source.toString('utf8'));
    const id = randomUUID();
    context.folderIds.set(folder.id, id);
    writeFile(stagingRoot, `folders/${id}.json`, serializeFolder({
      ...folder,
      id,
      name: `${folder.name} (Conflict ${context.suffix})`,
    }));
  } else if (relativePath.startsWith('notes/')) {
    const note = parseNote(source.toString('utf8'));
    const id = randomUUID();
    const conflict: Note = {
      ...note,
      id,
      title: `${note.title} (Conflict ${context.suffix})`,
      folderId: note.folderId ? context.folderIds.get(note.folderId) ?? note.folderId : null,
      content: replaceAssetReferences(note.content, context.assetPaths),
      updatedAt: Date.now(),
    };
    writeFile(stagingRoot, `notes/${id}.md`, serializeNote(conflict));
  } else if (relativePath.startsWith('whiteboards/')) {
    const whiteboard = parseWhiteboard(source.toString('utf8'));
    const id = randomUUID();
    writeFile(stagingRoot, `whiteboards/${id}.excalidraw.json`, serializeWhiteboard({
      ...whiteboard,
      id,
      title: `${whiteboard.title} (Conflict ${context.suffix})`,
      updatedAt: Date.now(),
    }));
  }
  context.conflictCount += 1;
};

const copyLocalVersion = (
  liveRoot: string,
  stagingRoot: string,
  relativePath: string,
  context: ReconcileContext,
): void => {
  const source = fs.readFileSync(path.join(liveRoot, relativePath));
  if (relativePath.startsWith('notes/') && (context.folderIds.size || context.assetPaths.size)) {
    const note = parseNote(source.toString('utf8'));
    writeFile(stagingRoot, relativePath, serializeNote({
      ...note,
      folderId: note.folderId ? context.folderIds.get(note.folderId) ?? note.folderId : null,
      content: replaceAssetReferences(note.content, context.assetPaths),
    }));
    return;
  }
  writeFile(stagingRoot, relativePath, source);
};

export const reconcileWorkspace = async (
  liveRoot: string,
  stagingRoot: string,
  repositoryUrl: string,
  branch: string,
): Promise<ReconcileResult> => {
  const base = await readBaseFiles(liveRoot, repositoryUrl, branch);
  const paths = new Set([...contentFiles(liveRoot), ...contentFiles(stagingRoot), ...base.keys()]);
  const context: ReconcileContext = {
    suffix: new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14),
    folderIds: new Map(),
    assetPaths: new Map(),
    conflictCount: 0,
  };
  let remoteChangeCount = 0;
  const ordered = [...paths].sort((left, right) => {
    const rank = (item: string) =>
      item.startsWith('assets/') ? 0 : item.startsWith('folders/') ? 1 : item.startsWith('notes/') ? 2 : 3;
    return rank(left) - rank(right) || left.localeCompare(right);
  });

  for (const relativePath of ordered) {
    const local = readOptional(liveRoot, relativePath);
    const remote = readOptional(stagingRoot, relativePath);
    const previous = base.get(relativePath) ?? null;
    if (!equalBuffers(remote, previous)) remoteChangeCount += 1;
    if (equalBuffers(local, remote)) continue;

    if (previous) {
      const localChanged = !equalBuffers(local, previous);
      const remoteChanged = !equalBuffers(remote, previous);
      if (!localChanged) continue;
      if (!remoteChanged) {
        if (local) copyLocalVersion(liveRoot, stagingRoot, relativePath, context);
        else removeFile(stagingRoot, relativePath);
        continue;
      }
    } else if (!remote && local) {
      copyLocalVersion(liveRoot, stagingRoot, relativePath, context);
      continue;
    }

    if (local) copyAsConflict(liveRoot, stagingRoot, relativePath, context);
  }
  return { conflictCount: context.conflictCount, remoteChangeCount };
};

const stageAll = async (directory: string): Promise<boolean> => {
  const matrix = await git.statusMatrix({ fs, dir: directory });
  let changed = false;
  for (const [filepath, head, workdir] of matrix) {
    if (head === workdir) continue;
    changed = true;
    if (workdir === 0) await git.remove({ fs, dir: directory, filepath });
    else await git.add({ fs, dir: directory, filepath });
  }
  return changed;
};

const commitAndPush = async (
  directory: string,
  repositoryUrl: string,
  branch: string,
  token: string,
  message: string,
): Promise<void> => {
  if (await stageAll(directory)) {
    await git.commit({
      fs,
      dir: directory,
      message,
      author: { name: 'Note & Save', email: 'sync@noteandsave.local' },
    });
  }
  await git.push({ fs, http, dir: directory, remote: 'origin', ref: branch, ...auth(token) });
};

const cloneRemote = async (
  directory: string,
  repositoryUrl: string,
  branch: string,
  token: string,
): Promise<'cloned' | 'empty'> => {
  try {
    await git.clone({
      fs,
      http,
      dir: directory,
      url: repositoryUrl,
      ref: branch,
      singleBranch: true,
      depth: 20,
      ...auth(token),
    });
    return 'cloned';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/could not find|no commits|unborn|empty/i.test(message)) throw error;
    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });
    await git.init({ fs, dir: directory, defaultBranch: branch });
    await git.addRemote({ fs, dir: directory, remote: 'origin', url: repositoryUrl });
    return 'empty';
  }
};

const runReconciledSync = async (
  repositoryUrl: string,
  branch: string,
  token: string,
  isCancelled: () => boolean,
): Promise<ReconcileResult> => {
  const storage = getStorageStatus();
  if (storage.mode !== 'files') throw new Error('Migrate the workspace to file storage before enabling Git sync');
  if (isRendererDirty()) throw new SyncDeferredError('Waiting for the current note to finish saving');
  const liveRoot = storage.workspacePath;
  const startingGeneration = getWorkspaceGeneration();
  const stagingRoot = `${liveRoot}.syncing`;
  if (fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true });

  const result = await cloneRemote(stagingRoot, repositoryUrl, branch, token);
  let resultSummary: ReconcileResult = { conflictCount: 0, remoteChangeCount: 0 };
  if (result === 'empty') {
    copyDirectory(liveRoot, stagingRoot);
  } else {
    const remote = new FileWorkspace(stagingRoot);
    if (!fs.existsSync(remote.manifestPath)) {
      const hasWorkspaceContent = CONTENT_DIRECTORIES.some((directory) =>
        fs.existsSync(path.join(stagingRoot, directory))
        && fs.readdirSync(path.join(stagingRoot, directory)).length > 0);
      if (hasWorkspaceContent) throw new Error('Repository is not a compatible Note & Save workspace');
      copyDirectory(liveRoot, stagingRoot);
    } else {
      remote.validate();
      resultSummary = await reconcileWorkspace(liveRoot, stagingRoot, repositoryUrl, branch);
    }
  }

  if (isCancelled()) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw new SyncCancelledError('Synchronization was cancelled');
  }
  if (isRendererDirty()) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    scheduleGitSync();
    throw new SyncDeferredError('Waiting for the current note to finish saving');
  }
  await commitAndPush(stagingRoot, repositoryUrl, branch, token, 'Sync Note & Save workspace');
  if (isCancelled()) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw new SyncCancelledError('Synchronization was cancelled');
  }
  if (getWorkspaceGeneration() !== startingGeneration) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    scheduleGitSync();
    throw new Error('The workspace changed during synchronization; the local edit was kept and sync will retry');
  }
  if (isRendererDirty()) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    scheduleGitSync();
    throw new SyncDeferredError('Waiting for the current note to finish saving');
  }
  replaceWorkspaceDirectory(liveRoot, stagingRoot);
  if (resultSummary.remoteChangeCount > 0) {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('workspace:changed');
  }
  return resultSummary;
};

export const initializeGitSync = (): void => {
  const stored = getSetting<StoredGitConfig>(CONFIG_KEY);
  config = stored && typeof stored === 'object'
    ? { ...stored, syncIntervalMinutes: normalizeSyncIntervalMinutes(stored.syncIntervalMinutes) }
    : null;
  if (!config) {
    updateStatus({
      state: 'unlinked',
      repositoryUrl: null,
      branch: null,
      syncIntervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
      lastSyncedAt: null,
      error: null,
      conflictCount: 0,
    });
  } else {
    updateStatus({
      state: 'idle',
      repositoryUrl: config.repositoryUrl,
      branch: config.branch,
      syncIntervalMinutes: normalizeSyncIntervalMinutes(config.syncIntervalMinutes),
      lastSyncedAt: config.lastSyncedAt,
      error: null,
    });
  }
  setWorkspaceChangeListener(scheduleGitSync);
  restartPeriodicTimer();
  if (config) setTimeout(() => void syncGitNow(), 2_000);
};

export const getGitSyncStatus = (): GitSyncStatus => ({ ...status });

export const linkGitRepository = async (input: LinkRepositoryInput): Promise<GitSyncStatus> => {
  const attemptId = ++linkAttemptId;
  const repositoryUrl = validateRepositoryUrl(input.repositoryUrl);
  const branch = input.branch?.trim() || 'main';
  if (!/^[A-Za-z0-9._/-]+$/.test(branch)) throw new Error('Branch name contains unsupported characters');
  if (!input.token.trim()) throw new Error('A GitHub personal access token is required');
  updateStatus({ state: 'syncing', repositoryUrl, branch, error: null, conflictCount: 0 });
  try {
    const result = await runReconciledSync(
      repositoryUrl,
      branch,
      input.token.trim(),
      () => attemptId !== linkAttemptId,
    );
    if (attemptId !== linkAttemptId) return getGitSyncStatus();
    config = {
      repositoryUrl,
      branch,
      encryptedToken: encryptToken(input.token.trim()),
      syncIntervalMinutes: status.syncIntervalMinutes,
      lastSyncedAt: Date.now(),
    };
    setSetting(CONFIG_KEY, config);
    return updateStatus({
      state: result.conflictCount ? 'conflict' : 'idle',
      repositoryUrl,
      branch,
      lastSyncedAt: config.lastSyncedAt,
      error: null,
      conflictCount: result.conflictCount,
    });
  } catch (error) {
    if (error instanceof SyncCancelledError) return getGitSyncStatus();
    if (error instanceof SyncDeferredError) {
      return updateStatus({
        state: config ? 'dirty' : 'error',
        repositoryUrl: config?.repositoryUrl ?? null,
        branch: config?.branch ?? null,
        error: config ? null : error.message,
      });
    }
    return updateStatus({
      state: 'error',
      repositoryUrl: config?.repositoryUrl ?? null,
      branch: config?.branch ?? null,
      error: sanitizeError(error, [input.token]),
    });
  }
};

export const unlinkGitRepository = (): GitSyncStatus => {
  linkAttemptId += 1;
  config = null;
  setSetting(CONFIG_KEY, null);
  return updateStatus({
    state: 'unlinked',
    repositoryUrl: null,
    branch: null,
    lastSyncedAt: null,
    error: null,
    conflictCount: 0,
  });
};

export const syncGitNow = async (): Promise<GitSyncStatus> => {
  if (!config) return getGitSyncStatus();
  if (syncPromise) return syncPromise;
  const operationConfig = config;
  syncPromise = (async () => {
    updateStatus({ state: 'syncing', error: null });
    try {
      const token = decryptToken(operationConfig.encryptedToken);
      const result = await runReconciledSync(
        operationConfig.repositoryUrl,
        operationConfig.branch,
        token,
        () => config !== operationConfig,
      );
      if (config !== operationConfig) return getGitSyncStatus();
      config = { ...operationConfig, lastSyncedAt: Date.now() };
      setSetting(CONFIG_KEY, config);
      return updateStatus({
        state: result.conflictCount ? 'conflict' : 'idle',
        lastSyncedAt: config.lastSyncedAt,
        error: null,
        conflictCount: result.conflictCount,
      });
    } catch (error) {
      if (error instanceof SyncCancelledError) return getGitSyncStatus();
      if (error instanceof SyncDeferredError) return updateStatus({ state: 'dirty', error: null });
      return updateStatus({ state: 'error', error: sanitizeError(error) });
    } finally {
      syncPromise = null;
    }
  })();
  return syncPromise;
};

export const setGitSyncInterval = (minutes: number): GitSyncStatus => {
  if (
    !Number.isInteger(minutes)
    || minutes < MIN_SYNC_INTERVAL_MINUTES
    || minutes > MAX_SYNC_INTERVAL_MINUTES
  ) {
    throw new Error(`Sync interval must be between ${MIN_SYNC_INTERVAL_MINUTES} and ${MAX_SYNC_INTERVAL_MINUTES} minutes`);
  }
  if (!config) throw new Error('Link a GitHub repository before changing the sync interval');

  config = { ...config, syncIntervalMinutes: minutes };
  setSetting(CONFIG_KEY, config);
  const nextStatus = updateStatus({ syncIntervalMinutes: minutes });
  restartPeriodicTimer();
  return nextStatus;
};

export const scheduleGitSync = (): void => {
  if (!config) return;
  updateStatus({ state: 'dirty' });
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncGitNow();
  }, SYNC_DEBOUNCE_MS);
};
