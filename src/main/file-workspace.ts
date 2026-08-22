import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  WORKSPACE_SCHEMA_VERSION,
  assertPortableId,
  type CreateFolderInput,
  type CreateNoteInput,
  type CreateWhiteboardInput,
  type Folder,
  type ImageRecord,
  type JsonValue,
  type Note,
  type SaveImageInput,
  type UpdateFolderInput,
  type UpdateNoteInput,
  type UpdateWhiteboardInput,
  type Whiteboard,
  type WorkspaceManifest,
} from '../shared/workspace';
import {
  parseFolder,
  parseManifest,
  parseNote,
  parseWhiteboard,
  serializeFolder,
  serializeManifest,
  serializeNote,
  serializeWhiteboard,
} from './workspace-codec';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

const EXTENSION_MIMES: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXTENSIONS).map(([mime, extension]) => [extension, mime]),
);

const ensureDirectory = (directory: string): void => {
  fs.mkdirSync(directory, { recursive: true });
};

const atomicWrite = (filePath: string, data: string | Uint8Array): void => {
  ensureDirectory(path.dirname(filePath));
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporaryPath, 'wx');
  try {
    fs.writeFileSync(descriptor, data);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporaryPath, filePath);
};

const listFiles = (directory: string, suffix: string): string[] => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith(suffix))
    .sort((left, right) => left.localeCompare(right));
};

const makeCopyTitle = (title: string): string => (title ? `${title} (Copy)` : 'Untitled Copy');

const toUint8Array = (data: SaveImageInput['data']): Uint8Array => {
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (data instanceof Uint8Array) return new Uint8Array(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return Uint8Array.from(data);
};

const collectAssetIds = (value: JsonValue, ids: Set<string>): void => {
  if (Array.isArray(value)) {
    for (const child of value) collectAssetIds(child, ids);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (value.type === 'image' && value.attrs && typeof value.attrs === 'object' && !Array.isArray(value.attrs)) {
    const source = value.attrs.src;
    if (typeof source === 'string' && source.startsWith('noteandsave-asset://')) {
      const filename = source.slice('noteandsave-asset://'.length);
      ids.add(path.basename(filename, path.extname(filename)));
    }
  }
  for (const child of Object.values(value)) collectAssetIds(child, ids);
};

export class FileWorkspace {
  readonly rootPath: string;
  readonly notesPath: string;
  readonly foldersPath: string;
  readonly whiteboardsPath: string;
  readonly assetsPath: string;
  readonly manifestPath: string;

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
    this.notesPath = path.join(this.rootPath, 'notes');
    this.foldersPath = path.join(this.rootPath, 'folders');
    this.whiteboardsPath = path.join(this.rootPath, 'whiteboards');
    this.assetsPath = path.join(this.rootPath, 'assets');
    this.manifestPath = path.join(this.rootPath, '.noteandsave', 'manifest.json');
  }

  initialize(workspaceId = randomUUID(), createdAt = Date.now()): WorkspaceManifest {
    ensureDirectory(this.notesPath);
    ensureDirectory(this.foldersPath);
    ensureDirectory(this.whiteboardsPath);
    ensureDirectory(this.assetsPath);

    if (fs.existsSync(this.manifestPath)) return this.getManifest();
    const manifest: WorkspaceManifest = { schemaVersion: WORKSPACE_SCHEMA_VERSION, workspaceId, createdAt };
    atomicWrite(this.manifestPath, serializeManifest(manifest));
    return manifest;
  }

  getManifest(): WorkspaceManifest {
    return parseManifest(fs.readFileSync(this.manifestPath, 'utf8'));
  }

  validate(): void {
    this.getManifest();
    const folders = this.listFolders();
    const folderIds = new Set(folders.map((folder) => folder.id));
    for (const folder of folders) {
      if (folder.parentId && !folderIds.has(folder.parentId)) {
        throw new Error(`Folder ${folder.id} references missing parent ${folder.parentId}`);
      }
      const visited = new Set([folder.id]);
      let parentId = folder.parentId;
      while (parentId) {
        if (visited.has(parentId)) throw new Error(`Folder hierarchy contains a cycle at ${parentId}`);
        visited.add(parentId);
        parentId = folders.find((candidate) => candidate.id === parentId)?.parentId ?? null;
      }
    }

    const assetIds = new Set<string>();
    for (const note of this.listNotes(true)) {
      if (note.folderId && !folderIds.has(note.folderId)) {
        throw new Error(`Note ${note.id} references missing folder ${note.folderId}`);
      }
      collectAssetIds(note.content, assetIds);
    }
    for (const assetId of assetIds) {
      if (!this.getImage(assetId)) throw new Error(`Note references missing asset ${assetId}`);
    }
    this.listWhiteboards(true);
  }

  private notePath(id: string): string {
    assertPortableId(id);
    return path.join(this.notesPath, `${id}.md`);
  }

  private folderPath(id: string): string {
    assertPortableId(id);
    return path.join(this.foldersPath, `${id}.json`);
  }

  private whiteboardPath(id: string): string {
    assertPortableId(id);
    return path.join(this.whiteboardsPath, `${id}.excalidraw.json`);
  }

  createNote(input: CreateNoteInput = {}): Note {
    const timestamp = input.createdAt ?? Date.now();
    const note: Note = {
      id: input.id ?? randomUUID(),
      title: input.title ?? '',
      content: input.content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
      createdAt: timestamp,
      updatedAt: input.updatedAt ?? timestamp,
      folderId: input.folderId ?? null,
      tags: input.tags ?? [],
      pinned: input.pinned ?? false,
      favorite: input.favorite ?? false,
      deleted: input.deleted ?? false,
      type: input.type ?? 'note',
    };
    const filePath = this.notePath(note.id);
    if (fs.existsSync(filePath)) throw new Error(`Note ${note.id} already exists`);
    atomicWrite(filePath, serializeNote(note));
    return note;
  }

  getNote(id: string): Note | null {
    const filePath = this.notePath(id);
    return fs.existsSync(filePath) ? parseNote(fs.readFileSync(filePath, 'utf8')) : null;
  }

  updateNote(id: string, updates: UpdateNoteInput): Note | null {
    const existing = this.getNote(id);
    if (!existing) return null;
    const note: Note = {
      ...existing,
      ...updates,
      folderId: updates.folderId === undefined ? existing.folderId : updates.folderId,
      tags: updates.tags ?? existing.tags,
      updatedAt: updates.updatedAt ?? Date.now(),
    };
    atomicWrite(this.notePath(id), serializeNote(note));
    return note;
  }

  listNotes(includeDeleted = false): Note[] {
    return listFiles(this.notesPath, '.md')
      .map((name) => {
        const note = parseNote(fs.readFileSync(path.join(this.notesPath, name), 'utf8'));
        if (name !== `${note.id}.md`) throw new Error(`Note filename does not match ID ${note.id}`);
        return note;
      })
      .filter((note) => includeDeleted || !note.deleted)
      .sort((left, right) =>
        Number(right.pinned) - Number(left.pinned)
        || Number(right.favorite) - Number(left.favorite)
        || right.updatedAt - left.updatedAt);
  }

  deleteNote(id: string): Note | null {
    return this.updateNote(id, { deleted: true, updatedAt: Date.now() });
  }

  permanentlyDeleteNote(id: string): boolean {
    const filePath = this.notePath(id);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  restoreNote(id: string): Note | null {
    return this.updateNote(id, { deleted: false, updatedAt: Date.now() });
  }

  duplicateNote(id: string): Note | null {
    const existing = this.getNote(id);
    if (!existing) return null;
    return this.createNote({
      title: makeCopyTitle(existing.title),
      content: existing.content,
      folderId: existing.folderId,
      tags: existing.tags,
      pinned: existing.pinned,
      favorite: existing.favorite,
      type: existing.type,
    });
  }

  createFolder(input: CreateFolderInput): Folder {
    const folder: Folder = {
      id: input.id ?? randomUUID(),
      name: input.name,
      parentId: input.parentId ?? null,
      createdAt: input.createdAt ?? Date.now(),
      order: input.order ?? 0,
    };
    const filePath = this.folderPath(folder.id);
    if (fs.existsSync(filePath)) throw new Error(`Folder ${folder.id} already exists`);
    atomicWrite(filePath, serializeFolder(folder));
    return folder;
  }

  getFolder(id: string): Folder | null {
    const filePath = this.folderPath(id);
    return fs.existsSync(filePath) ? parseFolder(fs.readFileSync(filePath, 'utf8')) : null;
  }

  updateFolder(id: string, updates: UpdateFolderInput): Folder | null {
    const existing = this.getFolder(id);
    if (!existing) return null;
    const folder: Folder = {
      ...existing,
      ...updates,
      parentId: updates.parentId === undefined ? existing.parentId : updates.parentId,
    };
    atomicWrite(this.folderPath(id), serializeFolder(folder));
    return folder;
  }

  listFolders(): Folder[] {
    return listFiles(this.foldersPath, '.json')
      .map((name) => {
        const folder = parseFolder(fs.readFileSync(path.join(this.foldersPath, name), 'utf8'));
        if (name !== `${folder.id}.json`) throw new Error(`Folder filename does not match ID ${folder.id}`);
        return folder;
      })
      .sort((left, right) =>
        Number(left.parentId !== null) - Number(right.parentId !== null)
        || left.order - right.order
        || left.name.localeCompare(right.name));
  }

  deleteFolder(id: string): boolean {
    const existing = this.getFolder(id);
    if (!existing) return false;
    for (const child of this.listFolders().filter((folder) => folder.parentId === id)) {
      this.updateFolder(child.id, { parentId: existing.parentId });
    }
    for (const note of this.listNotes(true).filter((item) => item.folderId === id)) {
      this.updateNote(note.id, { folderId: null });
    }
    fs.unlinkSync(this.folderPath(id));
    return true;
  }

  createWhiteboard(input: CreateWhiteboardInput = {}): Whiteboard {
    const timestamp = input.createdAt ?? Date.now();
    const whiteboard: Whiteboard = {
      id: input.id ?? randomUUID(),
      title: input.title ?? '',
      document: input.document ?? {},
      createdAt: timestamp,
      updatedAt: input.updatedAt ?? timestamp,
      pinned: input.pinned ?? false,
      favorite: input.favorite ?? false,
      deleted: input.deleted ?? false,
    };
    const filePath = this.whiteboardPath(whiteboard.id);
    if (fs.existsSync(filePath)) throw new Error(`Whiteboard ${whiteboard.id} already exists`);
    atomicWrite(filePath, serializeWhiteboard(whiteboard));
    return whiteboard;
  }

  getWhiteboard(id: string): Whiteboard | null {
    const filePath = this.whiteboardPath(id);
    return fs.existsSync(filePath) ? parseWhiteboard(fs.readFileSync(filePath, 'utf8')) : null;
  }

  updateWhiteboard(id: string, updates: UpdateWhiteboardInput): Whiteboard | null {
    const existing = this.getWhiteboard(id);
    if (!existing) return null;
    const whiteboard: Whiteboard = { ...existing, ...updates, updatedAt: updates.updatedAt ?? Date.now() };
    atomicWrite(this.whiteboardPath(id), serializeWhiteboard(whiteboard));
    return whiteboard;
  }

  listWhiteboards(includeDeleted = false): Whiteboard[] {
    return listFiles(this.whiteboardsPath, '.excalidraw.json')
      .map((name) => {
        const whiteboard = parseWhiteboard(fs.readFileSync(path.join(this.whiteboardsPath, name), 'utf8'));
        if (name !== `${whiteboard.id}.excalidraw.json`) {
          throw new Error(`Whiteboard filename does not match ID ${whiteboard.id}`);
        }
        return whiteboard;
      })
      .filter((whiteboard) => includeDeleted || !whiteboard.deleted)
      .sort((left, right) =>
        Number(right.pinned) - Number(left.pinned)
        || Number(right.favorite) - Number(left.favorite)
        || right.updatedAt - left.updatedAt);
  }

  deleteWhiteboard(id: string): Whiteboard | null {
    return this.updateWhiteboard(id, { deleted: true, updatedAt: Date.now() });
  }

  permanentlyDeleteWhiteboard(id: string): boolean {
    const filePath = this.whiteboardPath(id);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  restoreWhiteboard(id: string): Whiteboard | null {
    return this.updateWhiteboard(id, { deleted: false, updatedAt: Date.now() });
  }

  duplicateWhiteboard(id: string): Whiteboard | null {
    const existing = this.getWhiteboard(id);
    if (!existing) return null;
    return this.createWhiteboard({
      title: makeCopyTitle(existing.title),
      document: existing.document,
      pinned: existing.pinned,
      favorite: existing.favorite,
    });
  }

  saveImage(input: SaveImageInput): ImageRecord {
    const id = input.id ?? randomUUID();
    assertPortableId(id, 'image.id');
    const extension = MIME_EXTENSIONS[input.mimeType];
    if (!extension) throw new Error(`Unsupported image MIME type ${input.mimeType}`);
    for (const existing of this.findAssetFiles(id)) fs.unlinkSync(existing);
    const data = toUint8Array(input.data);
    atomicWrite(path.join(this.assetsPath, `${id}.${extension}`), data);
    return { id, data, mimeType: input.mimeType, createdAt: input.createdAt ?? Date.now() };
  }

  getImage(id: string): ImageRecord | null {
    assertPortableId(id, 'image.id');
    const [filePath] = this.findAssetFiles(id);
    if (!filePath) return null;
    const extension = path.extname(filePath).slice(1).toLowerCase();
    return {
      id,
      data: new Uint8Array(fs.readFileSync(filePath)),
      mimeType: EXTENSION_MIMES[extension] ?? 'application/octet-stream',
      createdAt: fs.statSync(filePath).birthtimeMs,
    };
  }

  deleteImage(id: string): boolean {
    const files = this.findAssetFiles(id);
    for (const filePath of files) fs.unlinkSync(filePath);
    return files.length > 0;
  }

  private findAssetFiles(id: string): string[] {
    assertPortableId(id, 'image.id');
    if (!fs.existsSync(this.assetsPath)) return [];
    return fs.readdirSync(this.assetsPath)
      .filter((name) => name.startsWith(`${id}.`))
      .map((name) => path.join(this.assetsPath, name));
  }
}

interface WorkspaceSwapJournal {
  liveRoot: string;
  stagingRoot: string;
  backupRoot: string;
}

const getSwapJournalPath = (liveRoot: string): string => `${liveRoot}.swap.json`;

export const recoverWorkspaceSwap = (liveRoot: string): void => {
  const journalPath = getSwapJournalPath(liveRoot);
  if (!fs.existsSync(journalPath)) return;
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as WorkspaceSwapJournal;
  if (path.resolve(journal.liveRoot) !== path.resolve(liveRoot)) {
    throw new Error('Workspace swap journal does not match the configured workspace');
  }

  try {
    if (!fs.existsSync(liveRoot) && fs.existsSync(journal.stagingRoot)) {
      fs.renameSync(journal.stagingRoot, liveRoot);
    }
    if (fs.existsSync(liveRoot)) {
      new FileWorkspace(liveRoot).validate();
      if (fs.existsSync(journal.backupRoot)) fs.rmSync(journal.backupRoot, { recursive: true, force: true });
      if (fs.existsSync(journal.stagingRoot)) fs.rmSync(journal.stagingRoot, { recursive: true, force: true });
      fs.unlinkSync(journalPath);
      return;
    }
  } catch {
    if (fs.existsSync(liveRoot)) fs.rmSync(liveRoot, { recursive: true, force: true });
  }

  if (!fs.existsSync(journal.backupRoot)) {
    throw new Error('Workspace swap recovery could not find a valid workspace or backup');
  }
  fs.renameSync(journal.backupRoot, liveRoot);
  new FileWorkspace(liveRoot).validate();
  if (fs.existsSync(journal.stagingRoot)) fs.rmSync(journal.stagingRoot, { recursive: true, force: true });
  fs.unlinkSync(journalPath);
};

export const replaceWorkspaceDirectory = (liveRoot: string, stagingRoot: string): void => {
  const backupRoot = `${liveRoot}.pre-sync-${Date.now()}`;
  const journalPath = getSwapJournalPath(liveRoot);
  const journal: WorkspaceSwapJournal = { liveRoot, stagingRoot, backupRoot };
  atomicWrite(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  fs.renameSync(liveRoot, backupRoot);
  try {
    fs.renameSync(stagingRoot, liveRoot);
    new FileWorkspace(liveRoot).validate();
    fs.rmSync(backupRoot, { recursive: true, force: true });
    fs.unlinkSync(journalPath);
  } catch (error) {
    recoverWorkspaceSwap(liveRoot);
    throw error;
  }
};
