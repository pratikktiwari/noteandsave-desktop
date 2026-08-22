import { Buffer } from 'buffer';
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

const MANIFEST_KEY = 'noteandsave.web.manifest';
const NOTES_KEY = 'noteandsave.web.notes';
const FOLDERS_KEY = 'noteandsave.web.folders';

const storage = () => {
  if (!globalThis.localStorage) throw new Error('Browser storage is unavailable');
  return globalThis.localStorage;
};

const readRecords = (key: string): Record<string, string> => {
  const value = storage().getItem(key);
  if (!value) return {};
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Browser workspace data is invalid');
  }
  return parsed as Record<string, string>;
};

const writeRecords = (key: string, records: Record<string, string>) => {
  storage().setItem(key, JSON.stringify(records));
};

const sortNotes = (notes: Note[]) => notes.sort((left, right) =>
  Number(right.pinned) - Number(left.pinned)
  || Number(right.favorite) - Number(left.favorite)
  || right.updatedAt - left.updatedAt);

export const workspacePath = 'Browser storage';
export const resolveAssetUri = (source: string) => source;
export const canonicalizeAssetUri = (source: string) => source;

export const workspaceRepository = {
  async initialize(): Promise<WorkspaceManifest> {
    const existing = storage().getItem(MANIFEST_KEY);
    if (existing) return parseManifest(existing);
    const manifest = {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      workspaceId: randomUUID(),
      createdAt: Date.now(),
    };
    storage().setItem(MANIFEST_KEY, serializeManifest(manifest));
    return manifest;
  },

  async listNotes(includeDeleted = true): Promise<Note[]> {
    const notes = Object.values(readRecords(NOTES_KEY)).map(parseNote);
    return sortNotes(notes.filter((note) => includeDeleted || !note.deleted));
  },

  async getNote(id: string): Promise<Note | null> {
    const value = readRecords(NOTES_KEY)[id];
    return value ? parseNote(value) : null;
  },

  async createNote(input: CreateNoteInput = {}): Promise<Note> {
    const records = readRecords(NOTES_KEY);
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
    if (records[note.id]) throw new Error(`Note ${note.id} already exists`);
    records[note.id] = serializeNote(note);
    writeRecords(NOTES_KEY, records);
    return note;
  },

  async updateNote(id: string, updates: UpdateNoteInput): Promise<Note> {
    const records = readRecords(NOTES_KEY);
    if (!records[id]) throw new Error(`Note ${id} was not found`);
    const note = {
      ...parseNote(records[id]),
      ...updates,
      updatedAt: updates.updatedAt ?? Date.now(),
    };
    records[id] = serializeNote(note);
    writeRecords(NOTES_KEY, records);
    return note;
  },

  async permanentlyDeleteNote(id: string): Promise<void> {
    const records = readRecords(NOTES_KEY);
    delete records[id];
    writeRecords(NOTES_KEY, records);
  },

  async listFolders(): Promise<Folder[]> {
    return Object.values(readRecords(FOLDERS_KEY))
      .map(parseFolder)
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  },

  async createFolder(name: string): Promise<Folder> {
    const records = readRecords(FOLDERS_KEY);
    const folder: Folder = {
      id: randomUUID(),
      name: name.trim(),
      parentId: null,
      createdAt: Date.now(),
      order: Object.keys(records).length,
    };
    records[folder.id] = serializeFolder(folder);
    writeRecords(FOLDERS_KEY, records);
    return folder;
  },

  async renameFolder(id: string, name: string): Promise<Folder> {
    const records = readRecords(FOLDERS_KEY);
    if (!records[id]) throw new Error(`Folder ${id} was not found`);
    const folder = { ...parseFolder(records[id]), name: name.trim() };
    records[id] = serializeFolder(folder);
    writeRecords(FOLDERS_KEY, records);
    return folder;
  },

  async deleteFolder(id: string): Promise<void> {
    const notes = await this.listNotes();
    await Promise.all(notes.filter((note) => note.folderId === id)
      .map((note) => this.updateNote(note.id, { folderId: null })));
    const records = readRecords(FOLDERS_KEY);
    delete records[id];
    writeRecords(FOLDERS_KEY, records);
  },

  async saveAsset(sourceUri: string): Promise<{ source: string; uri: string }> {
    if (sourceUri.startsWith('data:')) return { source: sourceUri, uri: sourceUri };
    const response = await fetch(sourceUri);
    if (!response.ok) throw new Error('Could not read the selected image');
    const blob = await response.blob();
    const data = Buffer.from(await blob.arrayBuffer()).toString('base64');
    const uri = `data:${blob.type || 'image/jpeg'};base64,${data}`;
    return { source: uri, uri };
  },
};
