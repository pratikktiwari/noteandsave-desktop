import { BrowserWindow, dialog, ipcMain } from 'electron';

import {
  createFolder,
  createNote,
  createWhiteboard,
  deleteFolder,
  deleteImage,
  deleteNote,
  deleteWhiteboard,
  duplicateNote,
  duplicateWhiteboard,
  getImage,
  getNote,
  getRevision,
  getSetting,
  getWhiteboard,
  listFolders,
  listNotes,
  listRevisionsByNoteId,
  listWhiteboards,
  permanentlyDeleteNote,
  permanentlyDeleteWhiteboard,
  restoreNote,
  restoreWhiteboard,
  saveImage,
  saveRevision,
  setSetting,
  updateFolder,
  updateNote,
  updateWhiteboard,
  type CreateFolderInput,
  type CreateNoteInput,
  type CreateWhiteboardInput,
  type SaveImageInput,
  type SaveRevisionInput,
  type UpdateFolderInput,
  type UpdateNoteInput,
  type UpdateWhiteboardInput,
} from './database';

let registered = false;

export const registerIpcHandlers = (): void => {
  if (registered) {
    return;
  }

  registered = true;

  ipcMain.handle('notes:list', (_event, includeDeleted?: boolean) => listNotes(includeDeleted));
  ipcMain.handle('notes:get', (_event, id: string) => getNote(id));
  ipcMain.handle('notes:create', (_event, input?: CreateNoteInput) => createNote(input));
  ipcMain.handle('notes:update', (_event, id: string, updates: UpdateNoteInput) => updateNote(id, updates));
  ipcMain.handle('notes:delete', (_event, id: string) => deleteNote(id));
  ipcMain.handle('notes:permanentlyDelete', (_event, id: string) => permanentlyDeleteNote(id));
  ipcMain.handle('notes:restore', (_event, id: string) => restoreNote(id));
  ipcMain.handle('notes:duplicate', (_event, id: string) => duplicateNote(id));

  ipcMain.handle('folders:list', () => listFolders());
  ipcMain.handle('folders:create', (_event, input: CreateFolderInput) => createFolder(input));
  ipcMain.handle('folders:update', (_event, id: string, updates: UpdateFolderInput) => updateFolder(id, updates));
  ipcMain.handle('folders:delete', (_event, id: string) => deleteFolder(id));

  ipcMain.handle('whiteboards:list', (_event, includeDeleted?: boolean) => listWhiteboards(includeDeleted));
  ipcMain.handle('whiteboards:get', (_event, id: string) => getWhiteboard(id));
  ipcMain.handle('whiteboards:create', (_event, input?: CreateWhiteboardInput) => createWhiteboard(input));
  ipcMain.handle('whiteboards:update', (_event, id: string, updates: UpdateWhiteboardInput) =>
    updateWhiteboard(id, updates),
  );
  ipcMain.handle('whiteboards:delete', (_event, id: string) => deleteWhiteboard(id));
  ipcMain.handle('whiteboards:permanentlyDelete', (_event, id: string) => permanentlyDeleteWhiteboard(id));
  ipcMain.handle('whiteboards:restore', (_event, id: string) => restoreWhiteboard(id));
  ipcMain.handle('whiteboards:duplicate', (_event, id: string) => duplicateWhiteboard(id));

  ipcMain.handle('revisions:save', (_event, input: SaveRevisionInput) => saveRevision(input));
  ipcMain.handle('revisions:list', (_event, noteId: string) => listRevisionsByNoteId(noteId));
  ipcMain.handle('revisions:get', (_event, id: string) => getRevision(id));

  ipcMain.handle('images:save', (_event, input: SaveImageInput) => saveImage(input));
  ipcMain.handle('images:get', (_event, id: string) => getImage(id));
  ipcMain.handle('images:delete', (_event, id: string) => deleteImage(id));

  ipcMain.handle('settings:get', (_event, key: string) => getSetting(key));
  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => setSetting(key, value));

  ipcMain.handle('dialog:selectFolder', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });
};
