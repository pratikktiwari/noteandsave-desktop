import { useCallback } from 'react';
import { nanoid } from 'nanoid';
import { createFolder, deleteFolder, listFolders, updateFolder } from '../lib/db';
import { useWorkspace } from '../context/WorkspaceContext';
import type { Folder } from '../types';

export function useFolders() {
  const { state, dispatch } = useWorkspace();

  const loadFolders = useCallback(async () => {
    const folders = await listFolders();
    dispatch({ type: 'SET_FOLDERS', payload: folders.sort((a, b) => a.order - b.order) });
  }, [dispatch]);

  const addFolder = useCallback(async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return null;
    const folder: Folder = {
      id: nanoid(),
      name: trimmedName,
      createdAt: Date.now(),
      order: state.folders.length === 0 ? 0 : Math.max(...state.folders.map((item) => item.order)) + 1,
    };
    await createFolder(folder);
    dispatch({ type: 'ADD_FOLDER', payload: folder });
    return folder;
  }, [dispatch, state.folders]);

  const renameFolder = useCallback(async (id: string, name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const folder = state.folders.find((item) => item.id === id);
    if (!folder) return;
    const updatedFolder: Folder = { ...folder, name: trimmedName };
    await updateFolder(updatedFolder);
    dispatch({ type: 'UPDATE_FOLDER', payload: updatedFolder });
  }, [dispatch, state.folders]);

  const removeFolder = useCallback(async (id: string) => {
    await deleteFolder(id);
    dispatch({ type: 'REMOVE_FOLDER', payload: id });
  }, [dispatch]);

  return { folders: state.folders, activeFolderId: state.activeFolderId, loadFolders, addFolder, renameFolder, removeFolder };
}
