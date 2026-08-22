import { useCallback, useEffect, useRef } from 'react';
import { getRevisions, saveRevision, updateNote } from '../lib/db';
import { useWorkspace } from '../context/WorkspaceContext';
import type { Note } from '../types';

const REVISION_INTERVAL_MS = 5 * 60 * 1000;

export function useAutosave(note: Note | null, delay = 500) {
  const { dispatch } = useWorkspace();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteRef = useRef<Note | null>(note);
  const pendingNoteRef = useRef<Note | null>(null);
  const lastRevisionTimestampsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!note?.id) return;
    let cancelled = false;
    const loadLastRevisionTimestamp = async () => {
      const revisions = await getRevisions(note.id);
      if (!cancelled) lastRevisionTimestampsRef.current[note.id] = revisions[0]?.timestamp ?? 0;
    };
    loadLastRevisionTimestamp().catch(() => {
      if (!cancelled) lastRevisionTimestampsRef.current[note.id] = lastRevisionTimestampsRef.current[note.id] ?? 0;
    });
    return () => { cancelled = true; };
  }, [note?.id]);

  const saveNote = useCallback(async (currentNote: Note | null) => {
    if (!currentNote) return;
    dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
    try {
      await updateNote(currentNote);
      let lastRevisionAt = lastRevisionTimestampsRef.current[currentNote.id];
      if (lastRevisionAt == null) {
        const revisions = await getRevisions(currentNote.id);
        lastRevisionAt = revisions[0]?.timestamp ?? 0;
        lastRevisionTimestampsRef.current[currentNote.id] = lastRevisionAt;
      }
      if (Date.now() - lastRevisionAt >= REVISION_INTERVAL_MS) {
        await saveRevision(currentNote.id, currentNote.title, currentNote.content);
        lastRevisionTimestampsRef.current[currentNote.id] = Date.now();
      }
      if (noteRef.current?.id === currentNote.id && !pendingNoteRef.current) {
        window.api.workspace.setEditorDirty(false);
      }
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
      setTimeout(() => { dispatch({ type: 'SET_SAVE_STATUS', payload: 'idle' }); }, 2000);
    } catch {
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'idle' });
    }
  }, [dispatch]);

  useEffect(() => {
    if (noteRef.current?.id !== note?.id && pendingNoteRef.current) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      const pendingNote = pendingNoteRef.current;
      pendingNoteRef.current = null;
      void saveNote(pendingNote);
    }
    noteRef.current = note;
  }, [note, saveNote]);

  const save = useCallback(async () => saveNote(noteRef.current), [saveNote]);

  const debouncedSave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pendingNoteRef.current = noteRef.current;
    timeoutRef.current = setTimeout(() => {
      const pendingNote = pendingNoteRef.current;
      pendingNoteRef.current = null;
      timeoutRef.current = null;
      void saveNote(pendingNote);
    }, delay);
  }, [saveNote, delay]);

  useEffect(() => {
    const handleBlur = () => { if (noteRef.current) save(); };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [save]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (noteRef.current) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        updateNote(noteRef.current).catch(() => undefined);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => { return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }; }, []);

  return { debouncedSave, saveNow: save };
}
