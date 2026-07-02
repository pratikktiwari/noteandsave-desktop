import React, { createContext, useContext, useReducer, type Dispatch } from 'react';
import type { WorkspaceState, WorkspaceAction } from '../types';

const initialState: WorkspaceState = {
  notes: [],
  folders: [],
  whiteboards: [],
  activeNoteId: null,
  activeWhiteboardId: null,
  activeTag: null,
  activeFolderId: null,
  sidebarView: 'all',
  searchQuery: '',
  sortBy: 'updatedAt',
  isLoading: true,
  saveStatus: 'idle',
};

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'SET_NOTES':
      return { ...state, notes: action.payload };
    case 'SET_FOLDERS':
      return { ...state, folders: action.payload };
    case 'SET_WHITEBOARDS':
      return { ...state, whiteboards: action.payload };
    case 'SET_ACTIVE_NOTE':
      return { ...state, activeNoteId: action.payload, activeWhiteboardId: action.payload ? null : state.activeWhiteboardId };
    case 'SET_ACTIVE_WHITEBOARD':
      return { ...state, activeWhiteboardId: action.payload, activeNoteId: action.payload ? null : state.activeNoteId };
    case 'SET_ACTIVE_TAG':
      return { ...state, activeTag: action.payload };
    case 'SET_ACTIVE_FOLDER':
      return { ...state, activeFolderId: action.payload };
    case 'SET_SIDEBAR_VIEW':
      return { ...state, sidebarView: action.payload };
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    case 'SET_SORT_BY':
      return { ...state, sortBy: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_SAVE_STATUS':
      return { ...state, saveStatus: action.payload };
    case 'UPDATE_NOTE':
      return { ...state, notes: state.notes.map((n) => n.id === action.payload.id ? action.payload : n) };
    case 'ADD_NOTE':
      return { ...state, notes: [action.payload, ...state.notes] };
    case 'REMOVE_NOTE':
      return { ...state, notes: state.notes.filter((n) => n.id !== action.payload) };
    case 'ADD_FOLDER':
      return { ...state, folders: [...state.folders, action.payload].sort((a, b) => a.order - b.order) };
    case 'UPDATE_FOLDER':
      return { ...state, folders: state.folders.map((f) => f.id === action.payload.id ? action.payload : f).sort((a, b) => a.order - b.order) };
    case 'REMOVE_FOLDER':
      return { ...state, folders: state.folders.filter((f) => f.id !== action.payload), activeFolderId: state.activeFolderId === action.payload ? null : state.activeFolderId, sidebarView: state.activeFolderId === action.payload ? 'all' : state.sidebarView };
    case 'ADD_WHITEBOARD':
      return { ...state, whiteboards: [action.payload, ...state.whiteboards] };
    case 'UPDATE_WHITEBOARD':
      return { ...state, whiteboards: state.whiteboards.map((w) => w.id === action.payload.id ? action.payload : w) };
    case 'REMOVE_WHITEBOARD':
      return { ...state, whiteboards: state.whiteboards.filter((w) => w.id !== action.payload) };
    default:
      return state;
  }
}

interface WorkspaceContextType {
  state: WorkspaceState;
  dispatch: Dispatch<WorkspaceAction>;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);
  return (
    <WorkspaceContext.Provider value={{ state, dispatch }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextType {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used within a WorkspaceProvider');
  return context;
}
