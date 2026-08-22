import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Directory, File, Paths } from 'expo-file-system';
import { Buffer } from 'buffer';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { parseManifest } from '@noteandsave/workspace-codec';
import { expoFs } from './expoFs';
import { workspacePath } from '@/workspace/repository';

export interface GitConfig {
  repositoryUrl: string;
  branch: string;
  lastSyncedAt: number | null;
}

export type GitLinkMode = 'existing' | 'new';

const CONFIG_KEY = 'noteandsave.git.config';
const TOKEN_KEY = 'noteandsave.git.token';

const auth = (token: string) => ({
  onAuth: () => ({ username: 'x-access-token', password: token }),
  onAuthFailure: () => ({ cancel: true }),
});

const sanitizeError = (error: unknown, token: string) => {
  const message = error instanceof Error ? error.message : String(error);
  return token ? message.split(token).join('[redacted]') : message;
};

const validateRepository = (value: string) => {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
    throw new Error('Use an HTTPS github.com repository URL');
  }
  if (parsed.username || parsed.password) throw new Error('Do not include credentials in the repository URL');
  return parsed.toString().replace(/\/$/, '');
};

const stageAll = async () => {
  const matrix = await git.statusMatrix({ fs: expoFs, dir: workspacePath });
  let changed = false;
  for (const [filepath, head, workdir] of matrix) {
    if (head === workdir) continue;
    changed = true;
    if (workdir === 0) await git.remove({ fs: expoFs, dir: workspacePath, filepath });
    else await git.add({ fs: expoFs, dir: workspacePath, filepath });
  }
  return changed;
};

const copyWorkspaceEntries = async (source: Directory, destination: Directory) => {
  if (!destination.exists) destination.create({ intermediates: true, idempotent: true });
  for (const entry of source.list()) {
    if (entry.name === '.git') continue;
    const target = entry instanceof Directory
      ? new Directory(destination, entry.name)
      : new File(destination, entry.name);
    await entry.copy(target);
  }
};

const clearWorkspaceEntries = () => {
  const workspace = new Directory(workspacePath);
  for (const entry of workspace.list()) {
    if (entry.name !== '.git') entry.delete();
  }
};

const replaceWithRemoteWorkspace = async (ref: string) => {
  const workspace = new Directory(workspacePath);
  const backups = new Directory(Paths.document, 'NoteAndSaveBackups');
  const backup = new Directory(backups, new Date().toISOString().replace(/[:.]/g, '-'));
  await copyWorkspaceEntries(workspace, backup);

  try {
    clearWorkspaceEntries();
    const oid = await git.resolveRef({ fs: expoFs, dir: workspacePath, ref: `refs/remotes/origin/${ref}` });
    await git.writeRef({ fs: expoFs, dir: workspacePath, ref: `refs/heads/${ref}`, value: oid, force: true });
    await git.checkout({ fs: expoFs, dir: workspacePath, ref, force: true });
  } catch (error) {
    clearWorkspaceEntries();
    await copyWorkspaceEntries(backup, workspace);
    throw error;
  }
};

const validateRemoteWorkspace = async (ref: string) => {
  const remoteRef = `refs/remotes/origin/${ref}`;
  const files = await git.listFiles({ fs: expoFs, dir: workspacePath, ref: remoteRef });
  if (!files.length) throw new Error('No existing workspace was found on this branch');
  if (!files.includes('.noteandsave/manifest.json')) {
    throw new Error('Repository is not a compatible Note & Save workspace');
  }
  const oid = await git.resolveRef({ fs: expoFs, dir: workspacePath, ref: remoteRef });
  const { blob } = await git.readBlob({
    fs: expoFs,
    dir: workspacePath,
    oid,
    filepath: '.noteandsave/manifest.json',
  });
  parseManifest(Buffer.from(blob).toString('utf8'));
};

let syncInFlight: Promise<GitConfig> | null = null;

const performSync = async (): Promise<GitConfig> => {
  const config = await gitSync.getConfig();
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!config || !token) throw new Error('Link a GitHub repository first');
  try {
    if (await stageAll()) {
      await git.commit({
        fs: expoFs,
        dir: workspacePath,
        message: 'Sync Note & Save workspace',
        author: { name: 'Note & Save', email: 'sync@noteandsave.local' },
      });
    }
    try {
      await git.pull({
        fs: expoFs,
        http,
        dir: workspacePath,
        ref: config.branch,
        singleBranch: true,
        author: { name: 'Note & Save', email: 'sync@noteandsave.local' },
        ...auth(token),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/no commits|could not find|unborn|empty|not found/i.test(message)) throw error;
    }
    if (await stageAll()) {
      await git.commit({
        fs: expoFs,
        dir: workspacePath,
        message: 'Sync Note & Save workspace',
        author: { name: 'Note & Save', email: 'sync@noteandsave.local' },
      });
    }
    await git.push({
      fs: expoFs,
      http,
      dir: workspacePath,
      remote: 'origin',
      ref: config.branch,
      ...auth(token),
    });
    const next = { ...config, lastSyncedAt: Date.now() };
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    return next;
  } catch (error) {
    throw new Error(sanitizeError(error, token));
  }
};

export const gitSync = {
  async getConfig(): Promise<GitConfig | null> {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GitConfig;
    return parsed && typeof parsed.repositoryUrl === 'string' ? parsed : null;
  },

  async link(repositoryUrl: string, branch: string, token: string, mode: GitLinkMode): Promise<GitConfig> {
    const url = validateRepository(repositoryUrl);
    const ref = branch.trim() || 'main';
    if (!/^[A-Za-z0-9._/-]+$/.test(ref)) throw new Error('Branch name contains unsupported characters');
    if (!token.trim()) throw new Error('A GitHub personal access token is required');
    if (!Paths.info(workspacePath, '.git').exists) {
      await git.init({ fs: expoFs, dir: workspacePath, defaultBranch: ref });
    }
    const remotes = await git.listRemotes({ fs: expoFs, dir: workspacePath });
    const origin = remotes.find((remote) => remote.remote === 'origin');
    if (origin && origin.url !== url) await git.deleteRemote({ fs: expoFs, dir: workspacePath, remote: 'origin' });
    if (!origin || origin.url !== url) {
      await git.addRemote({ fs: expoFs, dir: workspacePath, remote: 'origin', url });
    }

    let remoteExists = false;
    try {
      await git.fetch({ fs: expoFs, http, dir: workspacePath, remote: 'origin', ref, depth: 20, ...auth(token.trim()) });
      remoteExists = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/could not find|no commits|unborn|empty|not found/i.test(message)) {
        throw new Error(sanitizeError(error, token));
      }
    }

    if (mode === 'existing') {
      if (!remoteExists) throw new Error('No existing workspace was found on this branch');
      await validateRemoteWorkspace(ref);
      await replaceWithRemoteWorkspace(ref);
    } else if (remoteExists) {
      const remoteFiles = await git.listFiles({
        fs: expoFs,
        dir: workspacePath,
        ref: `refs/remotes/origin/${ref}`,
      });
      if (remoteFiles.length) {
        throw new Error('Choose Existing workspace for a repository that already contains files');
      }
    }

    const config = { repositoryUrl: url, branch: ref, lastSyncedAt: null };
    await SecureStore.setItemAsync(TOKEN_KEY, token.trim());
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return this.sync();
  },

  sync(): Promise<GitConfig> {
    if (syncInFlight) return syncInFlight;
    syncInFlight = performSync().finally(() => {
      syncInFlight = null;
    });
    return syncInFlight;
  },

  async unlink(): Promise<void> {
    await Promise.all([AsyncStorage.removeItem(CONFIG_KEY), SecureStore.deleteItemAsync(TOKEN_KEY)]);
  },
};
