import { useCallback, useState, useEffect } from 'react';
import { getPreference, setPreference } from '../lib/storage';
import type { SortOption } from '../types';

export function useLocalPreferences() {
  const getSortPreference = useCallback((): SortOption => {
    return getPreference<SortOption>('sort-by', 'updatedAt');
  }, []);

  const setSortPreference = useCallback((sort: SortOption) => {
    setPreference('sort-by', sort);
  }, []);

  const getLastOpenedNote = useCallback((): string | null => {
    return getPreference<string | null>('last-opened-note', null);
  }, []);

  const setLastOpenedNote = useCallback((noteId: string | null) => {
    setPreference('last-opened-note', noteId);
  }, []);

  const getSidebarCollapsed = useCallback((): boolean => {
    return getPreference<boolean>('sidebar-collapsed', false);
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setPreference('sidebar-collapsed', collapsed);
  }, []);

  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    return getPreference<'light' | 'dark'>('theme', 'light');
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      setPreference('theme', next);
      return next;
    });
  }, []);

  return { getSortPreference, setSortPreference, getLastOpenedNote, setLastOpenedNote, getSidebarCollapsed, setSidebarCollapsed, theme, toggleTheme };
}
