import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import {
  WORKSPACE_SCHEMA_VERSION,
  type CreateNoteInput,
  type Folder,
  type Note,
  type UpdateNoteInput,
  type WorkspaceManifest,
} from '@noteandsave/workspace';
import {
  parseFolder,
  parseManifest,
  parseNote,
  serializeFolder,
  serializeManifest,
  serializeNote,
} from '@noteandsave/workspace-codec';
import { createEmptyDocument } from './document';

const root = new Directory(Paths.document, 'NoteAndSave');
const notes = new Directory(root, 'notes');
const folders = new Directory(root, 'folders');
const assets = new Directory(root, 'assets');
const whiteboards = new Directory(root, 'whiteboards');
const metadata = new Directory(root, '.noteandsave');
const manifest = new File(metadata, 'manifest.json');

const ensureDirectory = (directory: Directory) => {
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
};

const atomicWrite = async (file: File, value: string | Uint8Array) => {
  ensureDirectory(file.parentDirectory);
  const temporary = new File(file.parentDirectory, `${file.name}.${randomUUID()}.tmp`);
  temporary.create();
  temporary.write(value);
  await temporary.move(file, { overwrite: true });
};

const noteFile = (id: string) => new File(notes, `${id}.md`);
const folderFile = (id: string) => new File(folders, `${id}.json`);

export const workspacePath = root.uri;
export const resolveAssetUri = (source: string) => {
  const prefix = 'noteandsave-asset://';
  return source.startsWith(prefix) ? new File(assets, source.slice(prefix.length)).uri : source;
};
export const canonicalizeAssetUri = (source: string) => {
  const prefix = `${assets.uri.replace(/\/$/, '')}/`;
  return source.startsWith(prefix) ? `noteandsave-asset://${source.slice(prefix.length)}` : source;
};

export const workspaceRepository = {
  async initialize(): Promise<WorkspaceManifest> {
    [root, notes, folders, assets, whiteboards, metadata].forEach(ensureDirectory);
    if (manifest.exists) return parseManifest(await manifest.text());
    const value = { schemaVersion: WORKSPACE_SCHEMA_VERSION, workspaceId: randomUUID(), createdAt: Date.now() };
    await atomicWrite(manifest, serializeManifest(value));
    return value;
  },

  async listNotes(includeDeleted = true): Promise<Note[]> {
    ensureDirectory(notes);
    const result = await Promise.all(
      notes.list()
        .filter((entry): entry is File => entry instanceof File && entry.extension === '.md')
        .map(async (entry) => parseNote(await entry.text())),
    );
    return result
      .filter((note) => includeDeleted || !note.deleted)
      .sort((left, right) =>
        Number(right.pinned) - Number(left.pinned)
        || Number(right.favorite) - Number(left.favorite)
        || right.updatedAt - left.updatedAt);
  },

  async getNote(id: string): Promise<Note | null> {
    const file = noteFile(id);
    return file.exists ? parseNote(await file.text()) : null;
  },

  async createNote(input: CreateNoteInput = {}): Promise<Note> {
    const now = Date.now();
    const note: Note = {
      id: input.id ?? randomUUID(),
      title: input.title ?? '',
      content: input.content ?? createEmptyDocument(),
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
      folderId: input.folderId ?? null,
      tags: input.tags ?? [],
      pinned: input.pinned ?? false,
      favorite: input.favorite ?? false,
      deleted: input.deleted ?? false,
      type: input.type ?? 'note',
    };
    const file = noteFile(note.id);
    if (file.exists) throw new Error(`Note ${note.id} already exists`);
    await atomicWrite(file, serializeNote(note));
    return note;
  },

  async updateNote(id: string, updates: UpdateNoteInput): Promise<Note> {
    const existing = await this.getNote(id);
    if (!existing) throw new Error(`Note ${id} was not found`);
    const note: Note = { ...existing, ...updates, updatedAt: updates.updatedAt ?? Date.now() };
    await atomicWrite(noteFile(id), serializeNote(note));
    return note;
  },

  async permanentlyDeleteNote(id: string): Promise<void> {
    const file = noteFile(id);
    if (file.exists) file.delete();
  },

  async listFolders(): Promise<Folder[]> {
    ensureDirectory(folders);
    const result = await Promise.all(
      folders.list()
        .filter((entry): entry is File => entry instanceof File && entry.extension === '.json')
        .map(async (entry) => parseFolder(await entry.text())),
    );
    return result.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  },

  async createFolder(name: string): Promise<Folder> {
    const existing = await this.listFolders();
    const folder: Folder = {
      id: randomUUID(),
      name: name.trim(),
      parentId: null,
      createdAt: Date.now(),
      order: existing.length,
    };
    await atomicWrite(folderFile(folder.id), serializeFolder(folder));
    return folder;
  },

  async renameFolder(id: string, name: string): Promise<Folder> {
    const file = folderFile(id);
    if (!file.exists) throw new Error(`Folder ${id} was not found`);
    const folder = { ...parseFolder(await file.text()), name: name.trim() };
    await atomicWrite(file, serializeFolder(folder));
    return folder;
  },

  async deleteFolder(id: string): Promise<void> {
    const affected = (await this.listNotes()).filter((note) => note.folderId === id);
    await Promise.all(affected.map((note) => this.updateNote(note.id, { folderId: null })));
    const file = folderFile(id);
    if (file.exists) file.delete();
  },

  async saveAsset(sourceUri: string): Promise<{ source: string; uri: string }> {
    ensureDirectory(assets);
    const source = new File(sourceUri);
    const extension = source.extension || '.jpg';
    const id = `${randomUUID()}${extension}`;
    const destination = new File(assets, id);
    await source.copy(destination);
    return { source: `noteandsave-asset://${id}`, uri: destination.uri };
  },
};
