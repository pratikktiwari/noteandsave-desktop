import type { JSONContent } from '@tiptap/react';
import type { Folder, Note, StoredImage, Whiteboard } from '../types';

export interface Revision {
  id: string;
  noteId: string;
  content: JSONContent;
  title: string;
  timestamp: number;
}

type RuntimeApi = typeof window.api;

function normalizeNote(note: any): Note {
  return {
    ...note,
    folderId: note.folderId ?? undefined,
    tags: Array.isArray(note.tags) ? note.tags : [],
  } as Note;
}

function normalizeFolder(folder: any): Folder {
  return {
    ...folder,
    parentId: folder.parentId ?? undefined,
  } as Folder;
}

function normalizeWhiteboard(whiteboard: any): Whiteboard {
  return whiteboard as Whiteboard;
}

function toNotePayload(note: Note) {
  return {
    ...note,
    folderId: note.folderId ?? null,
  };
}

function toFolderPayload(folder: Folder) {
  return {
    ...folder,
    parentId: folder.parentId ?? null,
  };
}

function requireResult<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

function getNotesApi() {
  return (window.api as RuntimeApi).notes;
}

function getFoldersApi() {
  return (window.api as RuntimeApi).folders;
}

function getWhiteboardsApi() {
  return (window.api as RuntimeApi).whiteboards;
}

function getRevisionsApi() {
  return (window.api as RuntimeApi).revisions;
}

function getImagesApi() {
  return (window.api as RuntimeApi).images;
}

function getSettingsApi() {
  return (window.api as RuntimeApi).settings;
}

function getDialogApi() {
  return (window.api as RuntimeApi).dialog;
}

// Notes
export async function createNote(note: Note): Promise<Note> {
  return normalizeNote(await getNotesApi().create(toNotePayload(note) as any));
}

export async function getNote(id: string): Promise<Note | undefined> {
  const note = await getNotesApi().get(id);
  return note ? normalizeNote(note) : undefined;
}

export async function updateNote(note: Note): Promise<Note> {
  const updated = await getNotesApi().update(note.id, toNotePayload(note) as any);
  return normalizeNote(requireResult(updated, `Failed to update note ${note.id}`));
}

export async function deleteNote(id: string): Promise<void> {
  await getNotesApi().delete(id);
}

export async function permanentlyDeleteNote(id: string): Promise<void> {
  await getNotesApi().permanentlyDelete(id);
}

export async function restoreNote(id: string): Promise<void> {
  await getNotesApi().restore(id);
}

export async function listNotes(includeDeleted = false): Promise<Note[]> {
  const notes = await getNotesApi().list(includeDeleted);
  return notes.map(normalizeNote);
}

export async function listDeletedNotes(): Promise<Note[]> {
  const notesApi = getNotesApi() as any;
  const deleted = typeof notesApi.listDeleted === 'function'
    ? await notesApi.listDeleted()
    : (await getNotesApi().list(true)).filter((note: any) => note.deleted);
  return deleted.map(normalizeNote);
}

export async function duplicateNote(id: string, _newId: string): Promise<Note | undefined> {
  const duplicated = await getNotesApi().duplicate(id);
  return duplicated ? normalizeNote(duplicated) : undefined;
}

// Folders
export async function createFolder(folder: Folder): Promise<Folder> {
  return normalizeFolder(await getFoldersApi().create(toFolderPayload(folder) as any));
}

export async function updateFolder(folder: Folder): Promise<Folder> {
  const updated = await getFoldersApi().update(folder.id, toFolderPayload(folder) as any);
  return normalizeFolder(requireResult(updated, `Failed to update folder ${folder.id}`));
}

export async function listFolders(): Promise<Folder[]> {
  const folders = await getFoldersApi().list();
  return folders.map(normalizeFolder);
}

export async function deleteFolder(id: string): Promise<void> {
  await getFoldersApi().delete(id);
}

// Whiteboards
export async function createWhiteboard(wb: Whiteboard): Promise<Whiteboard> {
  return normalizeWhiteboard(await getWhiteboardsApi().create(wb as any));
}

export async function getWhiteboard(id: string): Promise<Whiteboard | undefined> {
  const whiteboard = await getWhiteboardsApi().get(id);
  return whiteboard ? normalizeWhiteboard(whiteboard) : undefined;
}

export async function updateWhiteboard(wb: Whiteboard): Promise<Whiteboard> {
  const updated = await getWhiteboardsApi().update(wb.id, wb as any);
  return normalizeWhiteboard(requireResult(updated, `Failed to update whiteboard ${wb.id}`));
}

export async function listWhiteboards(includeDeleted = false): Promise<Whiteboard[]> {
  const whiteboards = await getWhiteboardsApi().list(includeDeleted);
  return whiteboards.map(normalizeWhiteboard);
}

export async function deleteWhiteboard(id: string): Promise<void> {
  await getWhiteboardsApi().delete(id);
}

export async function permanentlyDeleteWhiteboard(id: string): Promise<void> {
  await getWhiteboardsApi().permanentlyDelete(id);
}

export async function restoreWhiteboard(id: string): Promise<void> {
  await getWhiteboardsApi().restore(id);
}

export async function duplicateWhiteboard(id: string, _newId: string): Promise<Whiteboard | undefined> {
  const duplicated = await getWhiteboardsApi().duplicate(id);
  return duplicated ? normalizeWhiteboard(duplicated) : undefined;
}

// Revisions
export async function saveRevision(noteId: string, title: string, content: JSONContent): Promise<void> {
  await getRevisionsApi().save({ noteId, title, content } as any);
}

export async function getRevisions(noteId: string): Promise<Revision[]> {
  return await getRevisionsApi().list(noteId) as Revision[];
}

export async function getRevision(id: string): Promise<Revision | undefined> {
  const revision = await getRevisionsApi().get(id);
  return revision ?? undefined;
}

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

export async function saveImage(id: string, data: ArrayBuffer, mimeType: string): Promise<void>;
export async function saveImage(image: { id: string; blob: Blob; mimeType: string; createdAt?: number }): Promise<void>;
export async function saveImage(
  idOrImage: string | { id: string; blob: Blob; mimeType: string; createdAt?: number },
  data?: ArrayBuffer,
  mimeType?: string,
): Promise<void> {
  if (typeof idOrImage === 'string') {
    await getImagesApi().save({ id: idOrImage, data: new Uint8Array(data ?? new ArrayBuffer(0)), mimeType: mimeType ?? '' } as any);
    return;
  }

  const arrayBuffer = await blobToArrayBuffer(idOrImage.blob);
  await getImagesApi().save({
    id: idOrImage.id,
    data: new Uint8Array(arrayBuffer),
    mimeType: idOrImage.mimeType,
    createdAt: idOrImage.createdAt,
  } as any);
}

export async function getImage(id: string): Promise<{ data: ArrayBuffer; mimeType: string } | undefined> {
  const image = await getImagesApi().get(id);
  if (!image) return undefined;
  const view = image.data instanceof Uint8Array ? image.data : new Uint8Array(image.data as any);
  return { data: toArrayBuffer(view), mimeType: image.mimeType };
}

export async function deleteImage(id: string): Promise<void> {
  await getImagesApi().delete(id);
}

export async function getSetting(key: string): Promise<string | undefined> {
  const value = await getSettingsApi().get<string>(key);
  return value ?? undefined;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await getSettingsApi().set(key, value);
}

export async function selectFolder(): Promise<string | undefined> {
  const value = await getDialogApi().selectFolder();
  return value ?? undefined;
}
