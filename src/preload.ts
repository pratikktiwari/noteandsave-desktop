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
  ai: {
    getConfig: () => Promise<any>;
    setConfig: (config: any) => Promise<boolean>;
    testConnection: (config: any) => Promise<{ ok: boolean; error?: string }>;
    chat: (payload: { messages: any[]; conversationId?: string; includeNotes?: boolean; timeRange?: string }) => void;
    abort: () => void;
    onToken: (listener: (token: string) => void) => Unsubscribe;
    onDone: (listener: (fullText: string) => void) => Unsubscribe;
    onError: (listener: (error: string) => void) => Unsubscribe;
    conversations: {
      list: () => Promise<any[]>;
      create: (title?: string) => Promise<any>;
      delete: (id: string) => Promise<boolean>;
    };
    messages: {
      list: (conversationId: string) => Promise<any[]>;
      save: (msg: { conversationId: string; id: string; role: string; content: string }) => Promise<boolean>;
    };
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
  ai: {
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    setConfig: (config) => ipcRenderer.invoke('ai:setConfig', config),
    testConnection: (config) => ipcRenderer.invoke('ai:testConnection', config),
    chat: (payload) => ipcRenderer.send('ai:chat', payload),
    abort: () => ipcRenderer.send('ai:abort'),
    onToken: (listener) => {
      const handler = (_: any, token: string) => listener(token);
      ipcRenderer.on('ai:chat:token', handler);
      return () => ipcRenderer.removeListener('ai:chat:token', handler);
    },
    onDone: (listener) => {
      const handler = (_: any, fullText: string) => listener(fullText);
      ipcRenderer.on('ai:chat:done', handler);
      return () => ipcRenderer.removeListener('ai:chat:done', handler);
    },
    onError: (listener) => {
      const handler = (_: any, error: string) => listener(error);
      ipcRenderer.on('ai:chat:error', handler);
      return () => ipcRenderer.removeListener('ai:chat:error', handler);
    },
    conversations: {
      list: () => ipcRenderer.invoke('ai:conversations:list'),
      create: (title) => ipcRenderer.invoke('ai:conversations:create', title),
      delete: (id) => ipcRenderer.invoke('ai:conversations:delete', id),
    },
    messages: {
      list: (conversationId) => ipcRenderer.invoke('ai:messages:list', conversationId),
      save: (msg) => ipcRenderer.invoke('ai:messages:save', msg),
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
