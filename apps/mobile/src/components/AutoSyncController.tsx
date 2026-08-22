import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useAutoSyncStore } from '@/git/autoSync';
import { useWorkspaceStore } from '@/store/workspace';

export function AutoSyncController() {
  const pathname = usePathname();
  const workspaceReady = useWorkspaceStore((state) => state.initialized);
  const loaded = useAutoSyncStore((state) => state.loaded);
  const syncOnStart = useAutoSyncStore((state) => state.syncOnStart);
  const intervalMinutes = useAutoSyncStore((state) => state.intervalMinutes);
  const initialize = useAutoSyncStore((state) => state.initialize);
  const run = useAutoSyncStore((state) => state.run);
  const ranOnStart = useRef(false);
  const appState = useRef(AppState.currentState);
  const editorOpen = pathname.startsWith('/note/');

  const runWhenSafe = useCallback(() => {
    if (workspaceReady && loaded && !editorOpen && AppState.currentState === 'active') {
      void run();
    }
  }, [editorOpen, loaded, run, workspaceReady]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!syncOnStart || ranOnStart.current || !workspaceReady || !loaded) return;
    ranOnStart.current = true;
    runWhenSafe();
  }, [loaded, runWhenSafe, syncOnStart, workspaceReady]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const previous = appState.current;
      appState.current = next;
      if (syncOnStart && next === 'active' && previous !== 'active') runWhenSafe();
    });
    return () => subscription.remove();
  }, [runWhenSafe, syncOnStart]);

  useEffect(() => {
    if (!intervalMinutes || editorOpen || !workspaceReady || !loaded) return;
    const timer = setInterval(runWhenSafe, intervalMinutes * 60_000);
    return () => clearInterval(timer);
  }, [editorOpen, intervalMinutes, loaded, runWhenSafe, workspaceReady]);

  return null;
}
