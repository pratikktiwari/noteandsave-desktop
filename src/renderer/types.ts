import type { JSONContent } from '@tiptap/react';

export type NoteType = 'note' | 'checklist' | 'scratchpad';

export interface Note {
  id: string;
  title: string;
  content: JSONContent;
  createdAt: number;
  updatedAt: number;
  folderId?: string;
  tags: string[];
  pinned: boolean;
  favorite: boolean;
  deleted: boolean;
  type: NoteType;
}

export interface Whiteboard {
  id: string;
  title: string;
  document: any;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  favorite: boolean;
  deleted: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: number;
  order: number;
}

export interface StoredImage {
  id: string;
  data: Buffer;
  mimeType: string;
  createdAt: number;
}

export type SortOption = 'updatedAt' | 'createdAt' | 'title';
export type SidebarView = 'all' | 'favorites' | 'pinned' | 'trash' | 'folder' | 'whiteboards' | 'chat';

export interface WorkspaceState {
  notes: Note[];
  folders: Folder[];
  whiteboards: Whiteboard[];
  activeNoteId: string | null;
  activeWhiteboardId: string | null;
  activeTag: string | null;
  activeFolderId: string | null;
  sidebarView: SidebarView;
  searchQuery: string;
  sortBy: SortOption;
  isLoading: boolean;
  saveStatus: 'idle' | 'saving' | 'saved';
  viewMode: 'list' | 'grid';
}

export type WorkspaceAction =
  | { type: 'SET_NOTES'; payload: Note[] }
  | { type: 'SET_FOLDERS'; payload: Folder[] }
  | { type: 'SET_WHITEBOARDS'; payload: Whiteboard[] }
  | { type: 'SET_ACTIVE_NOTE'; payload: string | null }
  | { type: 'SET_ACTIVE_WHITEBOARD'; payload: string | null }
  | { type: 'SET_ACTIVE_TAG'; payload: string | null }
  | { type: 'SET_ACTIVE_FOLDER'; payload: string | null }
  | { type: 'SET_SIDEBAR_VIEW'; payload: SidebarView }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SORT_BY'; payload: SortOption }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SAVE_STATUS'; payload: 'idle' | 'saving' | 'saved' }
  | { type: 'SET_VIEW_MODE'; payload: 'list' | 'grid' }
  | { type: 'UPDATE_NOTE'; payload: Note }
  | { type: 'ADD_NOTE'; payload: Note }
  | { type: 'REMOVE_NOTE'; payload: string }
  | { type: 'ADD_FOLDER'; payload: Folder }
  | { type: 'UPDATE_FOLDER'; payload: Folder }
  | { type: 'REMOVE_FOLDER'; payload: string }
  | { type: 'ADD_WHITEBOARD'; payload: Whiteboard }
  | { type: 'UPDATE_WHITEBOARD'; payload: Whiteboard }
  | { type: 'REMOVE_WHITEBOARD'; payload: string };
