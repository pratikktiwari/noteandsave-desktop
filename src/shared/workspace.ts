export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const WORKSPACE_SCHEMA_VERSION = 1;

export interface WorkspaceManifest {
  schemaVersion: number;
  workspaceId: string;
  createdAt: number;
}

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

export interface WhiteboardFile extends Whiteboard {
  schemaVersion: number;
}

export interface FolderFile extends Folder {
  schemaVersion: number;
}

export const assertPortableId = (id: string, field = 'id'): void => {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`${field} contains characters that are not safe for a workspace path`);
  }
};

