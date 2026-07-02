import { app } from 'electron';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface Note {
  id: string;
  title: string;
  content: JsonValue;
  createdAt: number;
  updatedAt: number;
  folderId: string | null;
  tags: string[];
  pinned: boolean;
  favorite: boolean;
  deleted: boolean;
  type: string;
}

export interface CreateNoteInput {
  id?: string;
  title?: string;
  content?: JsonValue;
  createdAt?: number;
  updatedAt?: number;
  folderId?: string | null;
  tags?: string[];
  pinned?: boolean;
  favorite?: boolean;
  deleted?: boolean;
  type?: string;
}

export interface UpdateNoteInput {
  title?: string;
  content?: JsonValue;
  updatedAt?: number;
  folderId?: string | null;
  tags?: string[];
  pinned?: boolean;
  favorite?: boolean;
  deleted?: boolean;
  type?: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  order: number;
}

export interface CreateFolderInput {
  id?: string;
  name: string;
  parentId?: string | null;
  createdAt?: number;
  order?: number;
}

export interface UpdateFolderInput {
  name?: string;
  parentId?: string | null;
  order?: number;
}

export interface Whiteboard {
  id: string;
  title: string;
  document: JsonValue;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  favorite: boolean;
  deleted: boolean;
}

export interface CreateWhiteboardInput {
  id?: string;
  title?: string;
  document?: JsonValue;
  createdAt?: number;
  updatedAt?: number;
  pinned?: boolean;
  favorite?: boolean;
  deleted?: boolean;
}

export interface UpdateWhiteboardInput {
  title?: string;
  document?: JsonValue;
  updatedAt?: number;
  pinned?: boolean;
  favorite?: boolean;
  deleted?: boolean;
}

export interface Revision {
  id: string;
  noteId: string;
  content: JsonValue;
  title: string;
  timestamp: number;
}

export interface SaveRevisionInput {
  id?: string;
  noteId: string;
  content: JsonValue;
  title: string;
  timestamp?: number;
}

export interface ImageRecord {
  id: string;
  data: Uint8Array;
  mimeType: string;
  createdAt: number;
}

export interface SaveImageInput {
  id?: string;
  data: Uint8Array | Buffer | ArrayBuffer | number[];
  mimeType: string;
  createdAt?: number;
}

let databasePathOverride: string | null = null;
let database: Database.Database | null = null;

type NoteRow = {
  id: string;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
  folder_id: string | null;
  tags: string;
  pinned: number;
  favorite: number;
  deleted: number;
  type: string;
};

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
  order: number;
};

type WhiteboardRow = {
  id: string;
  title: string;
  document: string;
  created_at: number;
  updated_at: number;
  pinned: number;
  favorite: number;
  deleted: number;
};

type RevisionRow = {
  id: string;
  note_id: string;
  content: string;
  title: string;
  timestamp: number;
};

type ImageRow = {
  id: string;
  data: Buffer;
  mime_type: string;
  created_at: number;
};

type SettingRow = {
  key: string;
  value: string;
};

const getDefaultDbPath = (): string =>
  path.join(app.getPath('documents'), 'NoteAndSave', 'workspace.db');

export const getDbPath = (): string => databasePathOverride ?? getDefaultDbPath();

export const setDbPath = (nextPath: string): void => {
  if (databasePathOverride === nextPath) {
    return;
  }

  databasePathOverride = nextPath;

  if (database) {
    database.close();
    database = null;
  }
};

const ensureDirectoryExists = (filePath: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

const parseJson = <T>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const serializeJson = (value: unknown): string => JSON.stringify(value);

const toNote = (row: NoteRow): Note => ({
  id: row.id,
  title: row.title,
  content: parseJson<JsonValue>(row.content, {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  folderId: row.folder_id,
  tags: parseJson<string[]>(row.tags, []),
  pinned: row.pinned === 1,
  favorite: row.favorite === 1,
  deleted: row.deleted === 1,
  type: row.type,
});

const toFolder = (row: FolderRow): Folder => ({
  id: row.id,
  name: row.name,
  parentId: row.parent_id,
  createdAt: row.created_at,
  order: row.order,
});

const toWhiteboard = (row: WhiteboardRow): Whiteboard => ({
  id: row.id,
  title: row.title,
  document: parseJson<JsonValue>(row.document, {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  pinned: row.pinned === 1,
  favorite: row.favorite === 1,
  deleted: row.deleted === 1,
});

const toRevision = (row: RevisionRow): Revision => ({
  id: row.id,
  noteId: row.note_id,
  content: parseJson<JsonValue>(row.content, {}),
  title: row.title,
  timestamp: row.timestamp,
});

const toImageRecord = (row: ImageRow): ImageRecord => ({
  id: row.id,
  data: new Uint8Array(row.data),
  mimeType: row.mime_type,
  createdAt: row.created_at,
});

const runMigrations = (db: Database.Database): void => {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  if (currentVersion >= 1) {
    return;
  }

  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        folder_id TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        pinned INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0,
        deleted INTEGER NOT NULL DEFAULT 0,
        type TEXT NOT NULL DEFAULT 'note'
      );

      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT,
        created_at INTEGER NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS whiteboards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        document TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0,
        deleted INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS revisions (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL,
        content TEXT NOT NULL,
        title TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        data BLOB NOT NULL,
        mime_type TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_notes_folder_id ON notes (folder_id);
      CREATE INDEX IF NOT EXISTS idx_notes_deleted_updated_at ON notes (deleted, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders (parent_id);
      CREATE INDEX IF NOT EXISTS idx_whiteboards_deleted_updated_at ON whiteboards (deleted, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_revisions_note_id_timestamp ON revisions (note_id, timestamp DESC);
    `);

    db.pragma('user_version = 1');
  })();
};

const getDatabase = (): Database.Database => {
  if (!database) {
    const resolvedPath = getDbPath();
    ensureDirectoryExists(resolvedPath);
    database = new Database(resolvedPath);
    database.pragma('journal_mode = WAL');
    runMigrations(database);
  }

  return database;
};

const getTimestamp = (): number => Date.now();

const makeCopyTitle = (title: string): string => (title ? `${title} (Copy)` : 'Untitled Copy');

export const createNote = (input: CreateNoteInput = {}): Note => {
  const db = getDatabase();
  const timestamp = input.createdAt ?? getTimestamp();
  const note: Note = {
    id: input.id ?? randomUUID(),
    title: input.title ?? '',
    content: input.content ?? {},
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
    folderId: input.folderId ?? null,
    tags: input.tags ?? [],
    pinned: input.pinned ?? false,
    favorite: input.favorite ?? false,
    deleted: input.deleted ?? false,
    type: input.type ?? 'note',
  };

  db.prepare(
    `INSERT INTO notes (
      id, title, content, created_at, updated_at, folder_id, tags, pinned, favorite, deleted, type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    note.id,
    note.title,
    serializeJson(note.content),
    note.createdAt,
    note.updatedAt,
    note.folderId,
    serializeJson(note.tags),
    Number(note.pinned),
    Number(note.favorite),
    Number(note.deleted),
    note.type,
  );

  return note;
};

export const getNote = (id: string): Note | null => {
  const row = getDatabase().prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined;
  return row ? toNote(row) : null;
};

export const updateNote = (id: string, updates: UpdateNoteInput): Note | null => {
  const existing = getNote(id);

  if (!existing) {
    return null;
  }

  const nextNote: Note = {
    ...existing,
    ...updates,
    folderId: updates.folderId === undefined ? existing.folderId : updates.folderId,
    tags: updates.tags ?? existing.tags,
    updatedAt: updates.updatedAt ?? getTimestamp(),
  };

  getDatabase()
    .prepare(
      `UPDATE notes
       SET title = ?, content = ?, updated_at = ?, folder_id = ?, tags = ?, pinned = ?, favorite = ?, deleted = ?, type = ?
       WHERE id = ?`,
    )
    .run(
      nextNote.title,
      serializeJson(nextNote.content),
      nextNote.updatedAt,
      nextNote.folderId,
      serializeJson(nextNote.tags),
      Number(nextNote.pinned),
      Number(nextNote.favorite),
      Number(nextNote.deleted),
      nextNote.type,
      id,
    );

  return getNote(id);
};

export const listNotes = (includeDeleted = false): Note[] => {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM notes
       WHERE ? = 1 OR deleted = 0
       ORDER BY pinned DESC, favorite DESC, updated_at DESC`,
    )
    .all(Number(includeDeleted)) as NoteRow[];

  return rows.map(toNote);
};

export const listDeletedNotes = (): Note[] => {
  const rows = getDatabase()
    .prepare('SELECT * FROM notes WHERE deleted = 1 ORDER BY updated_at DESC')
    .all() as NoteRow[];

  return rows.map(toNote);
};

export const deleteNote = (id: string): Note | null =>
  updateNote(id, { deleted: true, updatedAt: getTimestamp() });

export const permanentlyDeleteNote = (id: string): boolean => {
  const db = getDatabase();

  return (
    db.transaction(() => {
      db.prepare('DELETE FROM revisions WHERE note_id = ?').run(id);
      return db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
    })()
  );
};

export const restoreNote = (id: string): Note | null =>
  updateNote(id, { deleted: false, updatedAt: getTimestamp() });

export const duplicateNote = (id: string): Note | null => {
  const existing = getNote(id);

  if (!existing) {
    return null;
  }

  return createNote({
    title: makeCopyTitle(existing.title),
    content: existing.content,
    folderId: existing.folderId,
    tags: existing.tags,
    pinned: existing.pinned,
    favorite: existing.favorite,
    deleted: false,
    type: existing.type,
  });
};

export const createFolder = (input: CreateFolderInput): Folder => {
  const folder: Folder = {
    id: input.id ?? randomUUID(),
    name: input.name,
    parentId: input.parentId ?? null,
    createdAt: input.createdAt ?? getTimestamp(),
    order: input.order ?? 0,
  };

  getDatabase()
    .prepare(
      'INSERT INTO folders (id, name, parent_id, created_at, "order") VALUES (?, ?, ?, ?, ?)',
    )
    .run(folder.id, folder.name, folder.parentId, folder.createdAt, folder.order);

  return folder;
};

export const getFolder = (id: string): Folder | null => {
  const row = getDatabase().prepare('SELECT * FROM folders WHERE id = ?').get(id) as FolderRow | undefined;
  return row ? toFolder(row) : null;
};

export const updateFolder = (id: string, updates: UpdateFolderInput): Folder | null => {
  const existing = getFolder(id);

  if (!existing) {
    return null;
  }

  const nextFolder: Folder = {
    ...existing,
    ...updates,
    parentId: updates.parentId === undefined ? existing.parentId : updates.parentId,
  };

  getDatabase()
    .prepare('UPDATE folders SET name = ?, parent_id = ?, "order" = ? WHERE id = ?')
    .run(nextFolder.name, nextFolder.parentId, nextFolder.order, id);

  return getFolder(id);
};

export const listFolders = (): Folder[] => {
  const rows = getDatabase()
    .prepare('SELECT * FROM folders ORDER BY parent_id IS NOT NULL, "order" ASC, name COLLATE NOCASE ASC')
    .all() as FolderRow[];

  return rows.map(toFolder);
};

export const deleteFolder = (id: string): boolean => {
  const db = getDatabase();
  const existing = getFolder(id);

  if (!existing) {
    return false;
  }

  return (
    db.transaction(() => {
      db.prepare('UPDATE folders SET parent_id = ? WHERE parent_id = ?').run(existing.parentId, id);
      db.prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ?').run(id);
      return db.prepare('DELETE FROM folders WHERE id = ?').run(id).changes > 0;
    })()
  );
};

export const createWhiteboard = (input: CreateWhiteboardInput = {}): Whiteboard => {
  const timestamp = input.createdAt ?? getTimestamp();
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

  getDatabase()
    .prepare(
      `INSERT INTO whiteboards (
        id, title, document, created_at, updated_at, pinned, favorite, deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      whiteboard.id,
      whiteboard.title,
      serializeJson(whiteboard.document),
      whiteboard.createdAt,
      whiteboard.updatedAt,
      Number(whiteboard.pinned),
      Number(whiteboard.favorite),
      Number(whiteboard.deleted),
    );

  return whiteboard;
};

export const getWhiteboard = (id: string): Whiteboard | null => {
  const row = getDatabase()
    .prepare('SELECT * FROM whiteboards WHERE id = ?')
    .get(id) as WhiteboardRow | undefined;

  return row ? toWhiteboard(row) : null;
};

export const updateWhiteboard = (id: string, updates: UpdateWhiteboardInput): Whiteboard | null => {
  const existing = getWhiteboard(id);

  if (!existing) {
    return null;
  }

  const nextWhiteboard: Whiteboard = {
    ...existing,
    ...updates,
    updatedAt: updates.updatedAt ?? getTimestamp(),
  };

  getDatabase()
    .prepare(
      `UPDATE whiteboards
       SET title = ?, document = ?, updated_at = ?, pinned = ?, favorite = ?, deleted = ?
       WHERE id = ?`,
    )
    .run(
      nextWhiteboard.title,
      serializeJson(nextWhiteboard.document),
      nextWhiteboard.updatedAt,
      Number(nextWhiteboard.pinned),
      Number(nextWhiteboard.favorite),
      Number(nextWhiteboard.deleted),
      id,
    );

  return getWhiteboard(id);
};

export const listWhiteboards = (includeDeleted = false): Whiteboard[] => {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM whiteboards
       WHERE ? = 1 OR deleted = 0
       ORDER BY pinned DESC, favorite DESC, updated_at DESC`,
    )
    .all(Number(includeDeleted)) as WhiteboardRow[];

  return rows.map(toWhiteboard);
};

export const deleteWhiteboard = (id: string): Whiteboard | null =>
  updateWhiteboard(id, { deleted: true, updatedAt: getTimestamp() });

export const permanentlyDeleteWhiteboard = (id: string): boolean =>
  getDatabase().prepare('DELETE FROM whiteboards WHERE id = ?').run(id).changes > 0;

export const restoreWhiteboard = (id: string): Whiteboard | null =>
  updateWhiteboard(id, { deleted: false, updatedAt: getTimestamp() });

export const duplicateWhiteboard = (id: string): Whiteboard | null => {
  const existing = getWhiteboard(id);

  if (!existing) {
    return null;
  }

  return createWhiteboard({
    title: makeCopyTitle(existing.title),
    document: existing.document,
    pinned: existing.pinned,
    favorite: existing.favorite,
    deleted: false,
  });
};

export const saveRevision = (input: SaveRevisionInput): Revision => {
  const db = getDatabase();
  const revision: Revision = {
    id: input.id ?? randomUUID(),
    noteId: input.noteId,
    content: input.content,
    title: input.title,
    timestamp: input.timestamp ?? getTimestamp(),
  };

  db.transaction(() => {
    db.prepare(
      'INSERT INTO revisions (id, note_id, content, title, timestamp) VALUES (?, ?, ?, ?, ?)',
    ).run(
      revision.id,
      revision.noteId,
      serializeJson(revision.content),
      revision.title,
      revision.timestamp,
    );

    db.prepare(
      `DELETE FROM revisions
       WHERE note_id = ?
         AND id IN (
           SELECT id
           FROM revisions
           WHERE note_id = ?
           ORDER BY timestamp DESC
           LIMIT -1 OFFSET 20
         )`,
    ).run(revision.noteId, revision.noteId);
  })();

  return revision;
};

export const listRevisionsByNoteId = (noteId: string): Revision[] => {
  const rows = getDatabase()
    .prepare('SELECT * FROM revisions WHERE note_id = ? ORDER BY timestamp DESC')
    .all(noteId) as RevisionRow[];

  return rows.map(toRevision);
};

export const getRevision = (id: string): Revision | null => {
  const row = getDatabase()
    .prepare('SELECT * FROM revisions WHERE id = ?')
    .get(id) as RevisionRow | undefined;

  return row ? toRevision(row) : null;
};

const toBuffer = (data: SaveImageInput['data']): Buffer => {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  return Buffer.from(data);
};

export const saveImage = (input: SaveImageInput): ImageRecord => {
  const image: ImageRecord = {
    id: input.id ?? randomUUID(),
    data: new Uint8Array(toBuffer(input.data)),
    mimeType: input.mimeType,
    createdAt: input.createdAt ?? getTimestamp(),
  };

  getDatabase()
    .prepare('INSERT OR REPLACE INTO images (id, data, mime_type, created_at) VALUES (?, ?, ?, ?)')
    .run(image.id, Buffer.from(image.data), image.mimeType, image.createdAt);

  return image;
};

export const getImage = (id: string): ImageRecord | null => {
  const row = getDatabase().prepare('SELECT * FROM images WHERE id = ?').get(id) as ImageRow | undefined;
  return row ? toImageRecord(row) : null;
};

export const deleteImage = (id: string): boolean =>
  getDatabase().prepare('DELETE FROM images WHERE id = ?').run(id).changes > 0;

export const getSetting = <T = unknown>(key: string): T | null => {
  const row = getDatabase().prepare('SELECT * FROM settings WHERE key = ?').get(key) as SettingRow | undefined;

  if (!row) {
    return null;
  }

  return parseJson<T>(row.value, row.value as unknown as T);
};

export const setSetting = <T>(key: string, value: T): T => {
  getDatabase()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, serializeJson(value));

  return value;
};
