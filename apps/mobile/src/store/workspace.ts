import { create } from 'zustand';
import type { Folder, JsonValue, Note, UpdateNoteInput } from '@noteandsave/workspace';
import { plainText } from '@/workspace/document';
import { workspaceRepository } from '@/workspace/repository';
import { searchIndex } from '@/workspace/searchIndex';

export type NoteFilter = 'all' | 'pinned' | 'favorites' | 'trash';

interface WorkspaceStore {
  notes: Note[];
  folders: Folder[];
  initialized: boolean;
  loading: boolean;
  error: string | null;
  filter: NoteFilter;
  query: string;
  searchResultIds: string[];
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  setFilter: (filter: NoteFilter) => void;
  setQuery: (query: string) => void;
  search: (query: string) => Promise<void>;
  createNote: (type?: 'note' | 'checklist', folderId?: string | null) => Promise<Note>;
  updateNote: (id: string, updates: UpdateNoteInput) => Promise<Note>;
  saveContent: (id: string, title: string, content: JsonValue) => Promise<Note>;
  duplicateNote: (id: string) => Promise<Note>;
  moveToTrash: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  permanentlyDeleteNote: (id: string) => Promise<void>;
  createFolder: (name: string) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  notes: [],
  folders: [],
  initialized: false,
  loading: false,
  error: null,
  filter: 'all',
  query: '',
  searchResultIds: [],

  initialize: async () => {
    if (get().initialized || get().loading) return;
    set({ loading: true, error: null });
    try {
      await workspaceRepository.initialize();
      const [notes, folders] = await Promise.all([
        workspaceRepository.listNotes(),
        workspaceRepository.listFolders(),
      ]);
      await searchIndex.rebuild(notes);
      set({ notes, folders, initialized: true, loading: false });
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const [notes, folders] = await Promise.all([
        workspaceRepository.listNotes(),
        workspaceRepository.listFolders(),
      ]);
      await searchIndex.rebuild(notes);
      set({ notes, folders, loading: false, initialized: true });
    } catch (error) {
      set({ error: errorMessage(error), loading: false });
    }
  },

  setFilter: (filter) => set({ filter }),
  setQuery: (query) => set({ query }),
  search: async (query) => {
    set({ query });
    const searchResultIds = await searchIndex.search(query);
    if (get().query === query) set({ searchResultIds });
  },

  createNote: async (type = 'note', folderId = null) => {
    const content = type === 'checklist'
      ? { type: 'doc', content: [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] }] } as JsonValue
      : undefined;
    const note = await workspaceRepository.createNote({ type, folderId, content });
    await searchIndex.upsert(note);
    set((state) => ({ notes: [note, ...state.notes] }));
    return note;
  },

  updateNote: async (id, updates) => {
    const note = await workspaceRepository.updateNote(id, updates);
    await searchIndex.upsert(note);
    set((state) => ({
      notes: state.notes.map((candidate) => candidate.id === id ? note : candidate),
    }));
    return note;
  },

  saveContent: async (id, title, content) => get().updateNote(id, { title, content }),

  duplicateNote: async (id) => {
    const existing = get().notes.find((note) => note.id === id);
    if (!existing) throw new Error('Note was not found');
    const duplicate = await workspaceRepository.createNote({
      ...existing,
      id: undefined,
      title: existing.title ? `${existing.title} copy` : 'Untitled copy',
      createdAt: undefined,
      updatedAt: undefined,
      deleted: false,
    });
    set((state) => ({ notes: [duplicate, ...state.notes] }));
    return duplicate;
  },

  moveToTrash: async (id) => {
    await get().updateNote(id, { deleted: true });
  },

  restoreNote: async (id) => {
    await get().updateNote(id, { deleted: false });
  },

  permanentlyDeleteNote: async (id) => {
    await workspaceRepository.permanentlyDeleteNote(id);
    await searchIndex.remove(id);
    set((state) => ({ notes: state.notes.filter((note) => note.id !== id) }));
  },

  createFolder: async (name) => {
    const folder = await workspaceRepository.createFolder(name);
    set((state) => ({ folders: [...state.folders, folder] }));
    return folder;
  },

  renameFolder: async (id, name) => {
    const folder = await workspaceRepository.renameFolder(id, name);
    set((state) => ({
      folders: state.folders.map((candidate) => candidate.id === id ? folder : candidate),
    }));
  },

  deleteFolder: async (id) => {
    await workspaceRepository.deleteFolder(id);
    set((state) => ({
      folders: state.folders.filter((folder) => folder.id !== id),
      notes: state.notes.map((note) => note.folderId === id ? { ...note, folderId: null } : note),
    }));
  },
}));

export const visibleNotes = (notes: Note[], filter: NoteFilter, query = '') => {
  const normalized = query.trim().toLocaleLowerCase();
  return notes.filter((note) => {
    if (filter === 'trash' ? !note.deleted : note.deleted) return false;
    if (filter === 'pinned' && !note.pinned) return false;
    if (filter === 'favorites' && !note.favorite) return false;
    if (!normalized) return true;
    return `${note.title} ${note.tags.join(' ')} ${plainText(note.content)}`.toLocaleLowerCase().includes(normalized);
  });
};
