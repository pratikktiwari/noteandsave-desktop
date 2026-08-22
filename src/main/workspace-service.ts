import { app, dialog } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import * as legacy from './database';
import { FileWorkspace, recoverWorkspaceSwap } from './file-workspace';
import { serializeFolder, serializeNote, serializeWhiteboard } from './workspace-codec';
import type {
  CreateFolderInput,
  CreateNoteInput,
  CreateWhiteboardInput,
  Folder,
  ImageRecord,
  JsonValue,
  Note,
  SaveImageInput,
  UpdateFolderInput,
  UpdateNoteInput,
  UpdateWhiteboardInput,
  Whiteboard,
} from '../shared/workspace';

export type StorageMode = 'sqlite' | 'files';

interface BootstrapState {
  version: 1;
  mode: StorageMode;
  legacyDbPath: string;
  workspacePath: string;
  migratedAt?: number;
}

export interface StorageStatus {
  mode: StorageMode;
  legacyDbPath: string;
  workspacePath: string;
  canMigrate: boolean;
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

let bootstrapState: BootstrapState | null = null;
let fileWorkspace: FileWorkspace | null = null;
let workspaceChangeListener: () => void = () => undefined;
let workspaceGeneration = 0;
let rendererDirty = false;

const getBootstrapPath = (): string => path.join(app.getPath('userData'), 'workspace-bootstrap.json');
const getHistoricalDbPath = (): string => path.join(app.getPath('documents'), 'NoteAndSave', 'workspace.db');
const getDefaultWorkspacePath = (dbPath = getHistoricalDbPath()): string =>
  path.join(path.dirname(dbPath), 'workspace');

const writeBootstrap = (state: BootstrapState): void => {
  const target = getBootstrapPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'w' });
  fs.renameSync(temporary, target);
  bootstrapState = state;
};

const readBootstrap = (): BootstrapState | null => {
  const target = getBootstrapPath();
  if (!fs.existsSync(target)) return null;
  const parsed = JSON.parse(fs.readFileSync(target, 'utf8')) as BootstrapState;
  if (parsed.version !== 1 || (parsed.mode !== 'sqlite' && parsed.mode !== 'files')) {
    throw new Error('Unsupported workspace bootstrap configuration');
  }
  return parsed;
};

const resolveLegacyDbPath = async (): Promise<string> => {
  const historicalPath = getHistoricalDbPath();
  legacy.setDbPath(historicalPath);
  await legacy.initDatabase();
  const configuredPath = legacy.getSetting<string>('dataPath');
  if (!configuredPath) return historicalPath;

  const candidate = path.extname(configuredPath).toLowerCase() === '.db'
    ? configuredPath
    : path.join(configuredPath, 'workspace.db');
  if (!fs.existsSync(candidate) || path.resolve(candidate) === path.resolve(historicalPath)) {
    return historicalPath;
  }

  legacy.setDbPath(candidate);
  await legacy.initDatabase();
  return candidate;
};

const getFiles = (): FileWorkspace => {
  if (!fileWorkspace) throw new Error('File workspace has not been initialized');
  return fileWorkspace;
};

const transformJson = (
  value: JsonValue,
  visitor: (node: Record<string, JsonValue>) => void,
): JsonValue => {
  if (Array.isArray(value)) return value.map((item) => transformJson(item, visitor));
  if (!value || typeof value !== 'object') return value;
  const next: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(value)) next[key] = transformJson(child, visitor);
  visitor(next);
  return next;
};

export const extractEmbeddedImages = (content: JsonValue, workspace: FileWorkspace): JsonValue =>
  transformJson(content, (node) => {
    if (node.type !== 'image' || !node.attrs || typeof node.attrs !== 'object' || Array.isArray(node.attrs)) return;
    const attrs = node.attrs as Record<string, JsonValue>;
    if (typeof attrs.src !== 'string' || !attrs.src.startsWith('data:')) return;
    const match = /^data:([^;,]+);base64,(.+)$/.exec(attrs.src);
    if (!match) throw new Error('Unsupported embedded image data URL');
    const mimeType = match[1];
    const extension = IMAGE_EXTENSIONS[mimeType];
    if (!extension) throw new Error(`Unsupported embedded image MIME type ${mimeType}`);
    const data = Buffer.from(match[2], 'base64');
    const id = `image-${createHash('sha256').update(data).digest('hex').slice(0, 24)}`;
    if (!workspace.getImage(id)) workspace.saveImage({ id, data, mimeType });
    attrs.src = `noteandsave-asset://${id}.${extension}`;
  });

const normalizeLegacyNoteContent = (content: JsonValue): JsonValue => {
  if (
    content
    && typeof content === 'object'
    && !Array.isArray(content)
    && Object.keys(content).length === 0
  ) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  return content;
};

const normalizeEditorJson = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(normalizeEditorJson);
  if (!value || typeof value !== 'object') return value;

  const normalized: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child === undefined || child === null) continue;
    if (key === 'content' && Array.isArray(child) && child.length === 0) continue;
    if (key === 'attrs' && child && typeof child === 'object' && !Array.isArray(child)) {
      const attrs = { ...child };
      if (value.type === 'link') {
        delete attrs.target;
        delete attrs.rel;
        delete attrs.class;
      }
      normalized[key] = normalizeEditorJson(attrs);
      continue;
    }
    normalized[key] = normalizeEditorJson(child);
  }
  return normalized;
};

const editorText = (value: JsonValue): string => {
  if (Array.isArray(value)) return value.map(editorText).join('');
  if (!value || typeof value !== 'object') return '';
  if (value.type === 'text' && typeof value.text === 'string') return value.text;
  if (value.type === 'hardBreak') return '\n';
  return value.content ? editorText(value.content) : '';
};

const editorNodeTypes = (value: JsonValue): string[] => {
  if (Array.isArray(value)) return value.flatMap(editorNodeTypes);
  if (!value || typeof value !== 'object') return [];
  const isImageOnlyParagraph = value.type === 'paragraph'
    && Array.isArray(value.content)
    && value.content.length === 1
    && value.content[0]
    && typeof value.content[0] === 'object'
    && !Array.isArray(value.content[0])
    && value.content[0].type === 'image';
  const types = typeof value.type === 'string' && value.type !== 'text' && !isImageOnlyParagraph
    ? [value.type]
    : [];
  return value.content ? [...types, ...editorNodeTypes(value.content)] : types;
};

const editorMarks = (value: JsonValue): string[] => {
  if (Array.isArray(value)) return [...new Set(value.flatMap(editorMarks))].sort();
  if (!value || typeof value !== 'object') return [];
  const marks = Array.isArray(value.marks)
    ? value.marks.map((mark) => {
      if (!mark || typeof mark !== 'object' || Array.isArray(mark) || typeof mark.type !== 'string') return '';
      const attrs = mark.attrs && typeof mark.attrs === 'object' && !Array.isArray(mark.attrs)
        ? mark.attrs
        : {};
      if (mark.type === 'link') return JSON.stringify({ type: mark.type, href: attrs.href });
      if (mark.type === 'noteLink') {
        return JSON.stringify({ type: mark.type, noteId: attrs.noteId, noteTitle: attrs.noteTitle });
      }
      if (mark.type === 'textStyle') return attrs.color
        ? JSON.stringify({ type: mark.type, color: attrs.color })
        : '';
      if (mark.type === 'highlight' && attrs.color) return JSON.stringify({ type: mark.type, color: attrs.color });
      return mark.type;
    }).filter(Boolean)
    : [];
  return value.content
    ? [...new Set([...marks, ...editorMarks(value.content)])].sort()
    : [...new Set(marks)].sort();
};

const editorNodeMetadata = (value: JsonValue): string[] => {
  if (Array.isArray(value)) return value.flatMap(editorNodeMetadata).sort();
  if (!value || typeof value !== 'object') return [];
  const metadata: string[] = [];
  if (typeof value.type === 'string' && value.type !== 'text' && value.attrs) {
    const attrs = value.attrs && typeof value.attrs === 'object' && !Array.isArray(value.attrs)
      ? value.attrs
      : {};
    if (value.type === 'heading') metadata.push(JSON.stringify({ type: value.type, level: attrs.level }));
    if (value.type === 'orderedList') metadata.push(JSON.stringify({ type: value.type, start: attrs.start ?? 1 }));
    if (value.type === 'taskItem') metadata.push(JSON.stringify({ type: value.type, checked: Boolean(attrs.checked) }));
    if (value.type === 'image') {
      metadata.push(JSON.stringify({
        type: value.type,
        src: attrs.src,
        alt: attrs.alt || null,
        title: attrs.title ?? null,
        width: attrs.width ?? null,
        height: attrs.height ?? null,
      }));
    }
    if (value.type === 'tableCell' || value.type === 'tableHeader') {
      metadata.push(JSON.stringify({
        type: value.type,
        colspan: attrs.colspan ?? 1,
        rowspan: attrs.rowspan ?? 1,
        colwidth: attrs.colwidth ?? null,
      }));
    }
  }
  return value.content ? [...metadata, ...editorNodeMetadata(value.content)].sort() : metadata;
};

export const notesMatchAfterRoundTrip = (expected: Note, actual: Note): boolean => {
  return Object.values(noteRoundTripChecks(expected, actual)).every(Boolean);
};

const noteRoundTripChecks = (expected: Note, actual: Note): Record<string, boolean> => {
  const { content: expectedContent, ...expectedMetadata } = expected;
  const { content: actualContent, ...actualMetadata } = actual;
  return {
    metadata: JSON.stringify(expectedMetadata) === JSON.stringify(actualMetadata),
    text: editorText(expectedContent) === editorText(actualContent),
    nodes: JSON.stringify(editorNodeTypes(expectedContent)) === JSON.stringify(editorNodeTypes(actualContent)),
    marks: JSON.stringify(editorMarks(expectedContent)) === JSON.stringify(editorMarks(actualContent)),
    nodeMetadata: JSON.stringify(editorNodeMetadata(expectedContent)) === JSON.stringify(editorNodeMetadata(actualContent)),
  };
};

const migrateLegacyWorkspace = (legacyDbPath: string, workspacePath: string): void => {
  const stagingPath = `${workspacePath}.migrating`;
  if (fs.existsSync(stagingPath)) fs.rmSync(stagingPath, { recursive: true, force: true });
  if (fs.existsSync(workspacePath)) {
    throw new Error(`Cannot migrate because ${workspacePath} already exists`);
  }

  const backupPath = `${legacyDbPath}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(legacyDbPath, backupPath, fs.constants.COPYFILE_EXCL);

  const staging = new FileWorkspace(stagingPath);
  staging.initialize(randomUUID());

  for (const image of legacy.listImages()) {
    staging.saveImage(image);
    const reloaded = staging.getImage(image.id);
    if (!reloaded || !Buffer.from(reloaded.data).equals(Buffer.from(image.data))) {
      throw new Error(`Image ${image.id} changed during migration`);
    }
  }
  for (const folder of legacy.listFolders()) {
    const created = staging.createFolder(folder);
    const reloaded = staging.getFolder(folder.id);
    if (!reloaded || serializeFolder(created) !== serializeFolder(reloaded)) {
      throw new Error(`Folder ${folder.id} changed during migration`);
    }
  }
  for (const note of legacy.listNotes(true)) {
    const created = staging.createNote({
      ...note,
      content: extractEmbeddedImages(normalizeLegacyNoteContent(note.content), staging),
    });
    const reloaded = staging.getNote(note.id);
    if (!reloaded || !notesMatchAfterRoundTrip(created, reloaded)) {
      throw new Error(`Note ${note.id} changed during migration`);
    }
  }
  for (const whiteboard of legacy.listWhiteboards(true)) {
    const created = staging.createWhiteboard(whiteboard);
    const reloaded = staging.getWhiteboard(whiteboard.id);
    if (!reloaded || serializeWhiteboard(created) !== serializeWhiteboard(reloaded)) {
      throw new Error(`Whiteboard ${whiteboard.id} changed during migration`);
    }
  }

  staging.validate();
  if (staging.listNotes(true).length !== legacy.listNotes(true).length) {
    throw new Error('Note count changed during migration');
  }
  if (staging.listFolders().length !== legacy.listFolders().length) {
    throw new Error('Folder count changed during migration');
  }
  if (staging.listWhiteboards(true).length !== legacy.listWhiteboards(true).length) {
    throw new Error('Whiteboard count changed during migration');
  }

  fs.renameSync(stagingPath, workspacePath);
};

const activateFiles = (state: BootstrapState): void => {
  recoverWorkspaceSwap(state.workspacePath);
  fileWorkspace = new FileWorkspace(state.workspacePath);
  fileWorkspace.initialize();
  fileWorkspace.validate();
  bootstrapState = state;
};

export const initializeWorkspaceService = async (): Promise<StorageStatus> => {
  const saved = readBootstrap();
  if (saved) {
    legacy.setDbPath(saved.legacyDbPath);
    await legacy.initDatabase();
    if (saved.mode === 'files') activateFiles(saved);
    else bootstrapState = saved;
    return getStorageStatus();
  }

  const historicalPath = getHistoricalDbPath();
  if (!fs.existsSync(historicalPath) || fs.statSync(historicalPath).size === 0) {
    const state: BootstrapState = {
      version: 1,
      mode: 'files',
      legacyDbPath: historicalPath,
      workspacePath: getDefaultWorkspacePath(historicalPath),
    };
    writeBootstrap(state);
    legacy.setDbPath(historicalPath);
    await legacy.initDatabase();
    activateFiles(state);
    return getStorageStatus();
  }

  const legacyDbPath = await resolveLegacyDbPath();
  const workspacePath = getDefaultWorkspacePath(legacyDbPath);
  const choice = await dialog.showMessageBox({
    type: 'question',
    title: 'Choose note storage',
    message: 'Move your notes to the new file-based format?',
    detail:
      'File storage keeps each note as Markdown and enables GitHub sync. '
      + 'Your existing SQLite database will be backed up and retained. '
      + 'You can keep SQLite now and migrate later from Settings.',
    buttons: ['Migrate to files', 'Keep SQLite'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (choice.response === 0) {
    try {
      migrateLegacyWorkspace(legacyDbPath, workspacePath);
      const state: BootstrapState = {
        version: 1,
        mode: 'files',
        legacyDbPath,
        workspacePath,
        migratedAt: Date.now(),
      };
      writeBootstrap(state);
      activateFiles(state);
    } catch {
      writeBootstrap({ version: 1, mode: 'sqlite', legacyDbPath, workspacePath });
    }
  } else {
    writeBootstrap({ version: 1, mode: 'sqlite', legacyDbPath, workspacePath });
  }

  return getStorageStatus();
};

export const migrateWorkspaceNow = (): StorageStatus => {
  const state = bootstrapState;
  if (!state) throw new Error('Workspace service is not initialized');
  if (state.mode === 'files') return getStorageStatus();
  migrateLegacyWorkspace(state.legacyDbPath, state.workspacePath);
  const next: BootstrapState = { ...state, mode: 'files', migratedAt: Date.now() };
  writeBootstrap(next);
  activateFiles(next);
  return getStorageStatus();
};

export const getStorageStatus = (): StorageStatus => {
  if (!bootstrapState) throw new Error('Workspace service is not initialized');
  return {
    mode: bootstrapState.mode,
    legacyDbPath: bootstrapState.legacyDbPath,
    workspacePath: bootstrapState.workspacePath,
    canMigrate: bootstrapState.mode === 'sqlite',
  };
};

export const setWorkspaceChangeListener = (listener: () => void): void => {
  workspaceChangeListener = listener;
};

export const getWorkspaceGeneration = (): number => workspaceGeneration;
export const isRendererDirty = (): boolean => rendererDirty;
export const setRendererDirty = (dirty: boolean): void => {
  rendererDirty = dirty;
};

const changed = <T>(value: T): T => {
  if (bootstrapState?.mode === 'files') {
    workspaceGeneration += 1;
    workspaceChangeListener();
  }
  return value;
};

export const listNotes = (includeDeleted = false): Note[] =>
  bootstrapState?.mode === 'files' ? getFiles().listNotes(includeDeleted) : legacy.listNotes(includeDeleted);
export const getNote = (id: string): Note | null =>
  bootstrapState?.mode === 'files' ? getFiles().getNote(id) : legacy.getNote(id);
export const createNote = (input?: CreateNoteInput): Note =>
  changed(bootstrapState?.mode === 'files' ? getFiles().createNote(input) : legacy.createNote(input));
export const updateNote = (id: string, updates: UpdateNoteInput): Note | null =>
  changed(bootstrapState?.mode === 'files' ? getFiles().updateNote(id, updates) : legacy.updateNote(id, updates));
export const deleteNote = (id: string): Note | null =>
  changed(bootstrapState?.mode === 'files' ? getFiles().deleteNote(id) : legacy.deleteNote(id));
export const permanentlyDeleteNote = (id: string): boolean =>
  changed(bootstrapState?.mode === 'files' ? getFiles().permanentlyDeleteNote(id) : legacy.permanentlyDeleteNote(id));
export const restoreNote = (id: string): Note | null =>
  changed(bootstrapState?.mode === 'files' ? getFiles().restoreNote(id) : legacy.restoreNote(id));
export const duplicateNote = (id: string): Note | null =>
  changed(bootstrapState?.mode === 'files' ? getFiles().duplicateNote(id) : legacy.duplicateNote(id));

export const listFolders = (): Folder[] =>
  bootstrapState?.mode === 'files' ? getFiles().listFolders() : legacy.listFolders();
export const createFolder = (input: CreateFolderInput): Folder =>
  changed(bootstrapState?.mode === 'files' ? getFiles().createFolder(input) : legacy.createFolder(input));
export const updateFolder = (id: string, updates: UpdateFolderInput): Folder | null =>
  changed(bootstrapState?.mode === 'files' ? getFiles().updateFolder(id, updates) : legacy.updateFolder(id, updates));
export const deleteFolder = (id: string): boolean =>
  changed(bootstrapState?.mode === 'files' ? getFiles().deleteFolder(id) : legacy.deleteFolder(id));

export const listWhiteboards = (includeDeleted = false): Whiteboard[] =>
  bootstrapState?.mode === 'files' ? getFiles().listWhiteboards(includeDeleted) : legacy.listWhiteboards(includeDeleted);
export const getWhiteboard = (id: string): Whiteboard | null =>
  bootstrapState?.mode === 'files' ? getFiles().getWhiteboard(id) : legacy.getWhiteboard(id);
export const createWhiteboard = (input?: CreateWhiteboardInput): Whiteboard =>
  changed(bootstrapState?.mode === 'files' ? getFiles().createWhiteboard(input) : legacy.createWhiteboard(input));
export const updateWhiteboard = (id: string, updates: UpdateWhiteboardInput): Whiteboard | null =>
  changed(bootstrapState?.mode === 'files' ? getFiles().updateWhiteboard(id, updates) : legacy.updateWhiteboard(id, updates));
export const deleteWhiteboard = (id: string): Whiteboard | null =>
  changed(bootstrapState?.mode === 'files' ? getFiles().deleteWhiteboard(id) : legacy.deleteWhiteboard(id));
export const permanentlyDeleteWhiteboard = (id: string): boolean =>
  changed(bootstrapState?.mode === 'files'
    ? getFiles().permanentlyDeleteWhiteboard(id)
    : legacy.permanentlyDeleteWhiteboard(id));
export const restoreWhiteboard = (id: string): Whiteboard | null =>
  changed(bootstrapState?.mode === 'files' ? getFiles().restoreWhiteboard(id) : legacy.restoreWhiteboard(id));
export const duplicateWhiteboard = (id: string): Whiteboard | null =>
  changed(bootstrapState?.mode === 'files' ? getFiles().duplicateWhiteboard(id) : legacy.duplicateWhiteboard(id));

export const saveImage = (input: SaveImageInput): ImageRecord =>
  changed(bootstrapState?.mode === 'files' ? getFiles().saveImage(input) : legacy.saveImage(input));
export const getImage = (id: string): ImageRecord | null =>
  bootstrapState?.mode === 'files' ? getFiles().getImage(id) : legacy.getImage(id);
export const deleteImage = (id: string): boolean =>
  changed(bootstrapState?.mode === 'files' ? getFiles().deleteImage(id) : legacy.deleteImage(id));
