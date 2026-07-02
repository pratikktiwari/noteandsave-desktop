import { useCallback, useEffect } from 'react';
import { nanoid } from 'nanoid';
import { useWorkspace } from '../context/WorkspaceContext';
import { createWhiteboard, listWhiteboards, updateWhiteboard, deleteWhiteboard, restoreWhiteboard, duplicateWhiteboard, permanentlyDeleteWhiteboard } from '../lib/db';
import type { Whiteboard } from '../types';

export function useWhiteboards() {
  const { state, dispatch } = useWorkspace();

  useEffect(() => {
    listWhiteboards(true).then((wbs) => {
      dispatch({ type: 'SET_WHITEBOARDS', payload: wbs });
    });
  }, []);

  const addWhiteboard = useCallback(async () => {
    const now = Date.now();
    const wb: Whiteboard = { id: nanoid(), title: 'Untitled Whiteboard', document: null, createdAt: now, updatedAt: now, pinned: false, favorite: false, deleted: false };
    await createWhiteboard(wb);
    dispatch({ type: 'ADD_WHITEBOARD', payload: wb });
    dispatch({ type: 'SET_ACTIVE_WHITEBOARD', payload: wb.id });
    return wb;
  }, [dispatch]);

  const renameWhiteboard = useCallback(async (id: string, title: string) => {
    const wb = state.whiteboards.find((w) => w.id === id);
    if (!wb) return;
    const updated = { ...wb, title, updatedAt: Date.now() };
    await updateWhiteboard(updated);
    dispatch({ type: 'UPDATE_WHITEBOARD', payload: updated });
  }, [state.whiteboards, dispatch]);

  const saveWhiteboardDocument = useCallback(async (id: string, document: any) => {
    const wb = state.whiteboards.find((w) => w.id === id);
    if (!wb) return;
    const updated = { ...wb, document, updatedAt: Date.now() };
    await updateWhiteboard(updated);
    dispatch({ type: 'UPDATE_WHITEBOARD', payload: updated });
  }, [state.whiteboards, dispatch]);

  const removeWhiteboard = useCallback(async (id: string) => {
    await deleteWhiteboard(id);
    const wb = state.whiteboards.find((w) => w.id === id);
    if (wb) dispatch({ type: 'UPDATE_WHITEBOARD', payload: { ...wb, deleted: true, updatedAt: Date.now() } });
    if (state.activeWhiteboardId === id) dispatch({ type: 'SET_ACTIVE_WHITEBOARD', payload: null });
  }, [state.whiteboards, state.activeWhiteboardId, dispatch]);

  const restoreWb = useCallback(async (id: string) => {
    await restoreWhiteboard(id);
    const wb = state.whiteboards.find((w) => w.id === id);
    if (wb) dispatch({ type: 'UPDATE_WHITEBOARD', payload: { ...wb, deleted: false, updatedAt: Date.now() } });
  }, [state.whiteboards, dispatch]);

  const permanentlyDelete = useCallback(async (id: string) => {
    await permanentlyDeleteWhiteboard(id);
    dispatch({ type: 'REMOVE_WHITEBOARD', payload: id });
  }, [dispatch]);

  const duplicate = useCallback(async (id: string) => {
    const newId = nanoid();
    const dup = await duplicateWhiteboard(id, newId);
    if (dup) dispatch({ type: 'ADD_WHITEBOARD', payload: dup });
  }, [dispatch]);

  const pinWhiteboard = useCallback(async (id: string) => {
    const wb = state.whiteboards.find((w) => w.id === id);
    if (!wb) return;
    const updated = { ...wb, pinned: !wb.pinned, updatedAt: Date.now() };
    await updateWhiteboard(updated);
    dispatch({ type: 'UPDATE_WHITEBOARD', payload: updated });
  }, [state.whiteboards, dispatch]);

  const favoriteWhiteboard = useCallback(async (id: string) => {
    const wb = state.whiteboards.find((w) => w.id === id);
    if (!wb) return;
    const updated = { ...wb, favorite: !wb.favorite, updatedAt: Date.now() };
    await updateWhiteboard(updated);
    dispatch({ type: 'UPDATE_WHITEBOARD', payload: updated });
  }, [state.whiteboards, dispatch]);

  return { whiteboards: state.whiteboards, addWhiteboard, renameWhiteboard, saveWhiteboardDocument, removeWhiteboard, restoreWhiteboard: restoreWb, permanentlyDeleteWhiteboard: permanentlyDelete, duplicateWhiteboard: duplicate, pinWhiteboard, favoriteWhiteboard };
}
