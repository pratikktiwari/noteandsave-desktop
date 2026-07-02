import React, { useCallback, useEffect, useRef, useState } from 'react';
import '../../../node_modules/@excalidraw/excalidraw/dist/dev/index.css';
import { useWorkspace } from '../context/WorkspaceContext';
import { useWhiteboards } from '../hooks/useWhiteboards';
import { getWhiteboard } from '../lib/db';

// Excalidraw types
interface ExcalidrawAPI {
  getSceneElements: () => any[];
  getAppState: () => any;
  getFiles: () => any;
  updateScene: (scene: any) => void;
  resetScene: () => void;
}

export function WhiteboardCanvas() {
  const { state, dispatch } = useWorkspace();
  const { saveWhiteboardDocument } = useWhiteboards();
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const activeId = state.activeWhiteboardId;
  const [ExcalidrawComp, setExcalidrawComp] = useState<React.ComponentType<any> | null>(null);
  const [initialData, setInitialData] = useState<any>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Dynamically import Excalidraw (it's heavy and uses window)
  useEffect(() => {
    let cancelled = false;
    import('@excalidraw/excalidraw').then((mod) => {
      if (!cancelled) {
        setExcalidrawComp(() => mod.Excalidraw);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Load whiteboard data
  useEffect(() => {
    if (!activeId) return;
    setIsLoading(true);
    getWhiteboard(activeId).then((wb) => {
      if (wb?.document && isMountedRef.current) {
        setInitialData(wb.document);
      } else {
        setInitialData(null);
      }
      setIsLoading(false);
    });
  }, [activeId]);

  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (!apiRef.current || !activeId || !isMountedRef.current) return;
      const snapshot = {
        elements: apiRef.current.getSceneElements(),
        appState: apiRef.current.getAppState(),
        files: apiRef.current.getFiles(),
      };
      dispatch({ type: 'SET_SAVE_STATUS', payload: 'saving' });
      saveWhiteboardDocument(activeId, snapshot).then(() => {
        if (!isMountedRef.current) return;
        dispatch({ type: 'SET_SAVE_STATUS', payload: 'saved' });
        setTimeout(() => {
          if (isMountedRef.current) dispatch({ type: 'SET_SAVE_STATUS', payload: 'idle' });
        }, 2000);
      });
    }, 800);
  }, [activeId, saveWhiteboardDocument, dispatch]);

  const handleChange = useCallback(() => {
    scheduleSave();
  }, [scheduleSave]);

  // Save on blur and beforeunload
  useEffect(() => {
    const handleBlur = () => {
      if (!apiRef.current || !activeId) return;
      const snapshot = {
        elements: apiRef.current.getSceneElements(),
        appState: apiRef.current.getAppState(),
        files: apiRef.current.getFiles(),
      };
      saveWhiteboardDocument(activeId, snapshot);
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBlur);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBlur);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [activeId, saveWhiteboardDocument]);

  if (!activeId) return null;

  if (!ExcalidrawComp || isLoading) {
    return (
      <div className="ws-whiteboard-canvas ws-whiteboard-canvas--loading">
        <p>Loading whiteboard...</p>
      </div>
    );
  }

  return (
    <div className="ws-whiteboard-canvas" style={{ width: '100%', height: '100%' }}>
      <ExcalidrawComp
        key={activeId}
        initialData={initialData ? {
          elements: initialData.elements || [],
          appState: initialData.appState ? {
            viewBackgroundColor: initialData.appState.viewBackgroundColor,
          } : undefined,
          files: initialData.files || undefined,
        } : undefined}
        excalidrawAPI={(api: ExcalidrawAPI) => { apiRef.current = api; }}
        onChange={(_elements: any[], _appState: any) => { scheduleSave(); }}
        theme={document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'}
      />
    </div>
  );
}
