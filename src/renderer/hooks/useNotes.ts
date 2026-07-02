import { useCallback, useEffect, useState } from 'react';
import { nanoid } from 'nanoid';
import { createNote, listNotes, listDeletedNotes, deleteNote, restoreNote, permanentlyDeleteNote, duplicateNote, updateNote } from '../lib/db';
import { useWorkspace } from '../context/WorkspaceContext';
import type { Note, NoteType } from '../types';

const SCRATCHPAD_ID = 'scratchpad-permanent';

export function useNotes() {
  const { state, dispatch } = useWorkspace();
  const [initialized, setInitialized] = useState(false);

  const loadNotes = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const notes = state.sidebarView === 'trash' ? await listDeletedNotes() : await listNotes();
      dispatch({ type: 'SET_NOTES', payload: notes });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [dispatch, state.sidebarView]);

  useEffect(() => {
    if (initialized) return;
    const init = async () => {
      const allNotes = await listNotes();
      const scratchpad = allNotes.find((n) => n.id === SCRATCHPAD_ID);
      if (!scratchpad) {
        const newScratchpad: Note = {
          id: SCRATCHPAD_ID,
          title: 'Quick Notes',
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: [],
          pinned: false,
          favorite: false,
          deleted: false,
          type: 'scratchpad',
        };
        await createNote(newScratchpad);
        allNotes.unshift(newScratchpad);
      }
      dispatch({ type: 'SET_NOTES', payload: allNotes });
      dispatch({ type: 'SET_LOADING', payload: false });
      setInitialized(true);
    };
    init();
  }, [dispatch, initialized]);

  useEffect(() => {
    if (initialized) loadNotes();
  }, [state.sidebarView, initialized, loadNotes]);

  const addNote = useCallback(async (type: NoteType = 'note') => {
    const now = Date.now();
    const note: Note = {
      id: nanoid(),
      title: type === 'checklist' ? 'Untitled Checklist' : 'Untitled',
      content: type === 'checklist'
        ? { type: 'doc', content: [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'My first task' }] }] }] }] }
        : { type: 'doc', content: [{ type: 'paragraph' }] },
      createdAt: now,
      updatedAt: now,
      tags: [],
      pinned: false,
      favorite: false,
      deleted: false,
      type,
      folderId: state.sidebarView === 'folder' ? state.activeFolderId ?? undefined : undefined,
    };
    await createNote(note);
    dispatch({ type: 'ADD_NOTE', payload: note });
    dispatch({ type: 'SET_ACTIVE_NOTE', payload: note.id });
    return note;
  }, [dispatch, state.activeFolderId, state.sidebarView]);

  const removeNote = useCallback(async (id: string) => {
    if (id === SCRATCHPAD_ID) return;
    await deleteNote(id);
    dispatch({ type: 'REMOVE_NOTE', payload: id });
    if (state.activeNoteId === id) dispatch({ type: 'SET_ACTIVE_NOTE', payload: null });
  }, [dispatch, state.activeNoteId]);

  const restore = useCallback(async (id: string) => {
    await restoreNote(id);
    dispatch({ type: 'REMOVE_NOTE', payload: id });
  }, [dispatch]);

  const permanentDelete = useCallback(async (id: string) => {
    if (id === SCRATCHPAD_ID) return;
    await permanentlyDeleteNote(id);
    dispatch({ type: 'REMOVE_NOTE', payload: id });
  }, [dispatch]);

  const duplicate = useCallback(async (id: string) => {
    const newId = nanoid();
    const dup = await duplicateNote(id, newId);
    if (dup) {
      dispatch({ type: 'ADD_NOTE', payload: dup });
      dispatch({ type: 'SET_ACTIVE_NOTE', payload: dup.id });
    }
  }, [dispatch]);

  const togglePin = useCallback(async (id: string) => {
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;
    const updated = { ...note, pinned: !note.pinned, updatedAt: Date.now() };
    await updateNote(updated);
    dispatch({ type: 'UPDATE_NOTE', payload: updated });
  }, [dispatch, state.notes]);

  const toggleFavorite = useCallback(async (id: string) => {
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;
    const updated = { ...note, favorite: !note.favorite, updatedAt: Date.now() };
    await updateNote(updated);
    dispatch({ type: 'UPDATE_NOTE', payload: updated });
  }, [dispatch, state.notes]);

  const renameNote = useCallback(async (id: string, title: string) => {
    if (id === SCRATCHPAD_ID) return;
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;
    const updated = { ...note, title, updatedAt: Date.now() };
    await updateNote(updated);
    dispatch({ type: 'UPDATE_NOTE', payload: updated });
  }, [dispatch, state.notes]);

  const moveToFolder = useCallback(async (id: string, folderId: string | null) => {
    const note = state.notes.find((n) => n.id === id);
    if (!note) return;
    const updated: Note = { ...note, folderId: folderId ?? undefined, updatedAt: Date.now() };
    await updateNote(updated);
    dispatch({ type: 'UPDATE_NOTE', payload: updated });
  }, [dispatch, state.notes]);

  const clearFolderFromNotes = useCallback(async (folderId: string) => {
    const allNotes = await listNotes(true);
    const notesInFolder = allNotes.filter((note) => note.folderId === folderId);
    await Promise.all(notesInFolder.map(async (note) => {
      const updated: Note = { ...note, folderId: undefined, updatedAt: Date.now() };
      await updateNote(updated);
    }));
    dispatch({ type: 'SET_NOTES', payload: state.notes.map((note) => note.folderId === folderId ? { ...note, folderId: undefined, updatedAt: Date.now() } : note) });
  }, [dispatch, state.notes]);

  return { notes: state.notes, activeNoteId: state.activeNoteId, isLoading: state.isLoading, addNote, removeNote, restore, permanentDelete, duplicate, togglePin, toggleFavorite, renameNote, moveToFolder, clearFolderFromNotes, loadNotes };
}
