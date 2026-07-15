import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

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
let database: SqlJsDatabase | null = null;
let databaseInitialization: Promise<void> | null = null;

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
  data: Buffer | Uint8Array;
  mime_type: string;
  created_at: number;
};

type SettingRow = {
  key: string;
  value: string;
};

type SqlParam = string | number | null | Uint8Array;

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

  databaseInitialization = null;
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

const getDatabase = (): SqlJsDatabase => {
  if (!database) {
    throw new Error('Database has not been initialized. Call initDatabase() before using database APIs.');
  }

  return database;
};

const saveToFile = (): void => {
  const db = getDatabase();
  const resolvedPath = getDbPath();
  ensureDirectoryExists(resolvedPath);
  fs.writeFileSync(resolvedPath, Buffer.from(db.export()));
};

const queryAllFromDatabase = <T>(db: SqlJsDatabase, sql: string, params: SqlParam[] = []): T[] => {
  const stmt = db.prepare(sql);

  try {
    if (params.length > 0) {
      stmt.bind(params);
    }

    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }

    return rows;
  } finally {
    stmt.free();
  }
};

const queryOneFromDatabase = <T>(db: SqlJsDatabase, sql: string, params: SqlParam[] = []): T | undefined => {
  const stmt = db.prepare(sql);

  try {
    if (params.length > 0) {
      stmt.bind(params);
    }

    if (stmt.step()) {
      return stmt.getAsObject() as T;
    }

    return undefined;
  } finally {
    stmt.free();
  }
};

const queryAll = <T>(sql: string, params: SqlParam[] = []): T[] =>
  queryAllFromDatabase<T>(getDatabase(), sql, params);

const queryOne = <T>(sql: string, params: SqlParam[] = []): T | undefined =>
  queryOneFromDatabase<T>(getDatabase(), sql, params);

const execute = (sql: string, params: SqlParam[] = [], persist = true): number => {
  const db = getDatabase();
  db.run(sql, params);
  const modifiedRows = db.getRowsModified();

  if (persist) {
    saveToFile();
  }

  return modifiedRows;
};

const runInTransaction = <T>(operation: () => T): T => {
  const db = getDatabase();
  db.run('BEGIN TRANSACTION');

  try {
    const result = operation();
    db.run('COMMIT');
    saveToFile();
    return result;
  } catch (error) {
    try {
      db.run('ROLLBACK');
    } catch {
      // no-op
    }

    throw error;
  }
};

const runMigrations = (db: SqlJsDatabase): void => {
  const currentVersion = Number(queryOneFromDatabase<{ user_version: number }>(db, 'PRAGMA user_version')?.user_version ?? 0);

  if (currentVersion >= 1) {
    return;
  }

  runInTransaction(() => {
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

    db.run('PRAGMA user_version = 1');
  });
};

export const initDatabase = async (): Promise<void> => {
  if (database) {
    return;
  }

  if (databaseInitialization) {
    return databaseInitialization;
  }

  databaseInitialization = (async () => {
    // Load WASM binary from build output (copied by vite-plugin-static-copy alongside main.js)
    const wasmPath = path.join(__dirname, 'sql-wasm.wasm');

    const wasmBinary = fs.readFileSync(wasmPath);
    const SQL = await initSqlJs({ wasmBinary });

    const resolvedPath = getDbPath();
    ensureDirectoryExists(resolvedPath);

    const shouldLoadFromDisk = fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).size > 0;
    database = shouldLoadFromDisk ? new SQL.Database(fs.readFileSync(resolvedPath)) : new SQL.Database();
    database.run('PRAGMA journal_mode = WAL');
    runMigrations(database);
  })().finally(() => {
    databaseInitialization = null;
  });

  return databaseInitialization;
};

const getTimestamp = (): number => Date.now();

const makeCopyTitle = (title: string): string => (title ? `${title} (Copy)` : 'Untitled Copy');

export const createNote = (input: CreateNoteInput = {}): Note => {
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

  execute(
    `INSERT INTO notes (
      id, title, content, created_at, updated_at, folder_id, tags, pinned, favorite, deleted, type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    ],
  );

  return note;
};

export const getNote = (id: string): Note | null => {
  const row = queryOne<NoteRow>('SELECT * FROM notes WHERE id = ?', [id]);
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

  execute(
    `UPDATE notes
     SET title = ?, content = ?, updated_at = ?, folder_id = ?, tags = ?, pinned = ?, favorite = ?, deleted = ?, type = ?
     WHERE id = ?`,
    [
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
    ],
  );

  return getNote(id);
};

export const listNotes = (includeDeleted = false): Note[] =>
  queryAll<NoteRow>(
    `SELECT * FROM notes
     WHERE ? = 1 OR deleted = 0
     ORDER BY pinned DESC, favorite DESC, updated_at DESC`,
    [Number(includeDeleted)],
  ).map(toNote);

export const listDeletedNotes = (): Note[] =>
  queryAll<NoteRow>('SELECT * FROM notes WHERE deleted = 1 ORDER BY updated_at DESC').map(toNote);

export const deleteNote = (id: string): Note | null =>
  updateNote(id, { deleted: true, updatedAt: getTimestamp() });

export const permanentlyDeleteNote = (id: string): boolean =>
  runInTransaction(() => {
    execute('DELETE FROM revisions WHERE note_id = ?', [id], false);
    return execute('DELETE FROM notes WHERE id = ?', [id], false) > 0;
  });

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

  execute('INSERT INTO folders (id, name, parent_id, created_at, "order") VALUES (?, ?, ?, ?, ?)', [
    folder.id,
    folder.name,
    folder.parentId,
    folder.createdAt,
    folder.order,
  ]);

  return folder;
};

export const getFolder = (id: string): Folder | null => {
  const row = queryOne<FolderRow>('SELECT * FROM folders WHERE id = ?', [id]);
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

  execute('UPDATE folders SET name = ?, parent_id = ?, "order" = ? WHERE id = ?', [
    nextFolder.name,
    nextFolder.parentId,
    nextFolder.order,
    id,
  ]);

  return getFolder(id);
};

export const listFolders = (): Folder[] =>
  queryAll<FolderRow>(
    'SELECT * FROM folders ORDER BY parent_id IS NOT NULL, "order" ASC, name COLLATE NOCASE ASC',
  ).map(toFolder);

export const deleteFolder = (id: string): boolean => {
  const existing = getFolder(id);

  if (!existing) {
    return false;
  }

  return runInTransaction(() => {
    execute('UPDATE folders SET parent_id = ? WHERE parent_id = ?', [existing.parentId, id], false);
    execute('UPDATE notes SET folder_id = NULL WHERE folder_id = ?', [id], false);
    return execute('DELETE FROM folders WHERE id = ?', [id], false) > 0;
  });
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

  execute(
    `INSERT INTO whiteboards (
      id, title, document, created_at, updated_at, pinned, favorite, deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      whiteboard.id,
      whiteboard.title,
      serializeJson(whiteboard.document),
      whiteboard.createdAt,
      whiteboard.updatedAt,
      Number(whiteboard.pinned),
      Number(whiteboard.favorite),
      Number(whiteboard.deleted),
    ],
  );

  return whiteboard;
};

export const getWhiteboard = (id: string): Whiteboard | null => {
  const row = queryOne<WhiteboardRow>('SELECT * FROM whiteboards WHERE id = ?', [id]);
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

  execute(
    `UPDATE whiteboards
     SET title = ?, document = ?, updated_at = ?, pinned = ?, favorite = ?, deleted = ?
     WHERE id = ?`,
    [
      nextWhiteboard.title,
      serializeJson(nextWhiteboard.document),
      nextWhiteboard.updatedAt,
      Number(nextWhiteboard.pinned),
      Number(nextWhiteboard.favorite),
      Number(nextWhiteboard.deleted),
      id,
    ],
  );

  return getWhiteboard(id);
};

export const listWhiteboards = (includeDeleted = false): Whiteboard[] =>
  queryAll<WhiteboardRow>(
    `SELECT * FROM whiteboards
     WHERE ? = 1 OR deleted = 0
     ORDER BY pinned DESC, favorite DESC, updated_at DESC`,
    [Number(includeDeleted)],
  ).map(toWhiteboard);

export const deleteWhiteboard = (id: string): Whiteboard | null =>
  updateWhiteboard(id, { deleted: true, updatedAt: getTimestamp() });

export const permanentlyDeleteWhiteboard = (id: string): boolean =>
  execute('DELETE FROM whiteboards WHERE id = ?', [id]) > 0;

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
  const revision: Revision = {
    id: input.id ?? randomUUID(),
    noteId: input.noteId,
    content: input.content,
    title: input.title,
    timestamp: input.timestamp ?? getTimestamp(),
  };

  runInTransaction(() => {
    execute('INSERT INTO revisions (id, note_id, content, title, timestamp) VALUES (?, ?, ?, ?, ?)', [
      revision.id,
      revision.noteId,
      serializeJson(revision.content),
      revision.title,
      revision.timestamp,
    ], false);

    execute(
      `DELETE FROM revisions
       WHERE note_id = ?
         AND id IN (
           SELECT id
           FROM revisions
           WHERE note_id = ?
           ORDER BY timestamp DESC
           LIMIT -1 OFFSET 20
         )`,
      [revision.noteId, revision.noteId],
      false,
    );
  });

  return revision;
};

export const listRevisionsByNoteId = (noteId: string): Revision[] =>
  queryAll<RevisionRow>('SELECT * FROM revisions WHERE note_id = ? ORDER BY timestamp DESC', [noteId]).map(
    toRevision,
  );

export const getRevision = (id: string): Revision | null => {
  const row = queryOne<RevisionRow>('SELECT * FROM revisions WHERE id = ?', [id]);
  return row ? toRevision(row) : null;
};

const toUint8Array = (data: SaveImageInput['data']): Uint8Array => {
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data);
  }

  if (data instanceof Uint8Array) {
    return new Uint8Array(data);
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  return Uint8Array.from(data);
};

export const saveImage = (input: SaveImageInput): ImageRecord => {
  const image: ImageRecord = {
    id: input.id ?? randomUUID(),
    data: toUint8Array(input.data),
    mimeType: input.mimeType,
    createdAt: input.createdAt ?? getTimestamp(),
  };

  execute('INSERT OR REPLACE INTO images (id, data, mime_type, created_at) VALUES (?, ?, ?, ?)', [
    image.id,
    image.data,
    image.mimeType,
    image.createdAt,
  ]);

  return image;
};

export const getImage = (id: string): ImageRecord | null => {
  const row = queryOne<ImageRow>('SELECT * FROM images WHERE id = ?', [id]);
  return row ? toImageRecord(row) : null;
};

export const deleteImage = (id: string): boolean => execute('DELETE FROM images WHERE id = ?', [id]) > 0;

export const getSetting = <T = unknown>(key: string): T | null => {
  const row = queryOne<SettingRow>('SELECT * FROM settings WHERE key = ?', [key]);

  if (!row) {
    return null;
  }

  return parseJson<T>(row.value, row.value as unknown as T);
};

export const setSetting = <T>(key: string, value: T): T => {
  execute('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
    key,
    serializeJson(value),
  ]);

  return value;
};
