import { contextBridge, ipcRenderer } from 'electron';

import type {
  CreateFolderInput,
  CreateNoteInput,
  CreateWhiteboardInput,
  Folder,
  ImageRecord,
  Note,
  Revision,
  SaveImageInput,
  SaveRevisionInput,
  UpdateFolderInput,
  UpdateNoteInput,
  UpdateWhiteboardInput,
  Whiteboard,
} from './main/database';

type Unsubscribe = () => void;

const subscribe = (channel: string, listener: () => void): Unsubscribe => {
  const wrappedListener = (): void => listener();
  ipcRenderer.on(channel, wrappedListener);

  return () => {
    ipcRenderer.removeListener(channel, wrappedListener);
  };
};

export interface DesktopApi {
  notes: {
    list: (includeDeleted?: boolean) => Promise<Note[]>;
    get: (id: string) => Promise<Note | null>;
    create: (input?: CreateNoteInput) => Promise<Note>;
    update: (id: string, updates: UpdateNoteInput) => Promise<Note | null>;
    delete: (id: string) => Promise<Note | null>;
    permanentlyDelete: (id: string) => Promise<boolean>;
    restore: (id: string) => Promise<Note | null>;
    duplicate: (id: string) => Promise<Note | null>;
  };
  folders: {
    list: () => Promise<Folder[]>;
    create: (input: CreateFolderInput) => Promise<Folder>;
    update: (id: string, updates: UpdateFolderInput) => Promise<Folder | null>;
    delete: (id: string) => Promise<boolean>;
  };
  whiteboards: {
    list: (includeDeleted?: boolean) => Promise<Whiteboard[]>;
    get: (id: string) => Promise<Whiteboard | null>;
    create: (input?: CreateWhiteboardInput) => Promise<Whiteboard>;
    update: (id: string, updates: UpdateWhiteboardInput) => Promise<Whiteboard | null>;
    delete: (id: string) => Promise<Whiteboard | null>;
    permanentlyDelete: (id: string) => Promise<boolean>;
    restore: (id: string) => Promise<Whiteboard | null>;
    duplicate: (id: string) => Promise<Whiteboard | null>;
  };
  revisions: {
    save: (input: SaveRevisionInput) => Promise<Revision>;
    list: (noteId: string) => Promise<Revision[]>;
    get: (id: string) => Promise<Revision | null>;
  };
  images: {
    save: (input: SaveImageInput) => Promise<ImageRecord>;
    get: (id: string) => Promise<ImageRecord | null>;
    delete: (id: string) => Promise<boolean>;
  };
  settings: {
    get: <T = unknown>(key: string) => Promise<T | null>;
    set: <T>(key: string, value: T) => Promise<T>;
  };
  dialog: {
    selectFolder: () => Promise<string | null>;
  };
  menu: {
    onNewNote: (listener: () => void) => Unsubscribe;
    onNewWhiteboard: (listener: () => void) => Unsubscribe;
    onToggleSidebar: (listener: () => void) => Unsubscribe;
  };
}

declare global {
  interface Window {
    api: DesktopApi;
  }
}

const api: DesktopApi = {
  notes: {
    list: (includeDeleted) => ipcRenderer.invoke('notes:list', includeDeleted) as Promise<Note[]>,
    get: (id) => ipcRenderer.invoke('notes:get', id) as Promise<Note | null>,
    create: (input) => ipcRenderer.invoke('notes:create', input) as Promise<Note>,
    update: (id, updates) => ipcRenderer.invoke('notes:update', id, updates) as Promise<Note | null>,
    delete: (id) => ipcRenderer.invoke('notes:delete', id) as Promise<Note | null>,
    permanentlyDelete: (id) => ipcRenderer.invoke('notes:permanentlyDelete', id) as Promise<boolean>,
    restore: (id) => ipcRenderer.invoke('notes:restore', id) as Promise<Note | null>,
    duplicate: (id) => ipcRenderer.invoke('notes:duplicate', id) as Promise<Note | null>,
  },
  folders: {
    list: () => ipcRenderer.invoke('folders:list') as Promise<Folder[]>,
    create: (input) => ipcRenderer.invoke('folders:create', input) as Promise<Folder>,
    update: (id, updates) => ipcRenderer.invoke('folders:update', id, updates) as Promise<Folder | null>,
    delete: (id) => ipcRenderer.invoke('folders:delete', id) as Promise<boolean>,
  },
  whiteboards: {
    list: (includeDeleted) => ipcRenderer.invoke('whiteboards:list', includeDeleted) as Promise<Whiteboard[]>,
    get: (id) => ipcRenderer.invoke('whiteboards:get', id) as Promise<Whiteboard | null>,
    create: (input) => ipcRenderer.invoke('whiteboards:create', input) as Promise<Whiteboard>,
    update: (id, updates) =>
      ipcRenderer.invoke('whiteboards:update', id, updates) as Promise<Whiteboard | null>,
    delete: (id) => ipcRenderer.invoke('whiteboards:delete', id) as Promise<Whiteboard | null>,
    permanentlyDelete: (id) =>
      ipcRenderer.invoke('whiteboards:permanentlyDelete', id) as Promise<boolean>,
    restore: (id) => ipcRenderer.invoke('whiteboards:restore', id) as Promise<Whiteboard | null>,
    duplicate: (id) => ipcRenderer.invoke('whiteboards:duplicate', id) as Promise<Whiteboard | null>,
  },
  revisions: {
    save: (input) => ipcRenderer.invoke('revisions:save', input) as Promise<Revision>,
    list: (noteId) => ipcRenderer.invoke('revisions:list', noteId) as Promise<Revision[]>,
    get: (id) => ipcRenderer.invoke('revisions:get', id) as Promise<Revision | null>,
  },
  images: {
    save: (input) => ipcRenderer.invoke('images:save', input) as Promise<ImageRecord>,
    get: (id) => ipcRenderer.invoke('images:get', id) as Promise<ImageRecord | null>,
    delete: (id) => ipcRenderer.invoke('images:delete', id) as Promise<boolean>,
  },
  settings: {
    get: <T = unknown>(key: string) => ipcRenderer.invoke('settings:get', key) as Promise<T | null>,
    set: <T>(key: string, value: T) => ipcRenderer.invoke('settings:set', key, value) as Promise<T>,
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder') as Promise<string | null>,
  },
  menu: {
    onNewNote: (listener) => subscribe('menu:newNote', listener),
    onNewWhiteboard: (listener) => subscribe('menu:newWhiteboard', listener),
    onToggleSidebar: (listener) => subscribe('menu:toggleSidebar', listener),
  },
};

contextBridge.exposeInMainWorld('api', api);
