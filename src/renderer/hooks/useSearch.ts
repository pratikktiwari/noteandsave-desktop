import { useDeferredValue, useMemo } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { extractTextFromJSON } from '../lib/search-utils';
import type { Note, SidebarView, SortOption } from '../types';

export interface SearchResult {
  note: Note;
  contentText: string;
  matchesTitle: boolean;
  matchesContent: boolean;
}

interface SearchFilters {
  searchQuery: string;
  sidebarView: SidebarView;
  activeFolderId: string | null;
  activeTag: string | null;
}

interface IndexedNoteContent {
  contentText: string;
  normalizedContentText: string;
}

export type SearchIndex = Map<string, IndexedNoteContent>;

function buildSearchIndex(notes: Note[]): SearchIndex {
  return new Map(notes.map((note) => {
    const contentText = extractTextFromJSON(note.content);
    return [note.id, { contentText, normalizedContentText: contentText.toLowerCase() }];
  }));
}

export function filterNotes(notes: Note[], { searchQuery, sidebarView, activeFolderId, activeTag }: SearchFilters, searchIndex: SearchIndex, contentSearchQuery = searchQuery): SearchResult[] {
  const titleQuery = searchQuery.trim().toLowerCase();
  const contentQuery = contentSearchQuery.trim().toLowerCase();

  return notes.map((note) => {
    const indexedContent = searchIndex.get(note.id);
    const contentText = indexedContent?.contentText ?? '';
    const matchesTitle = titleQuery ? note.title.toLowerCase().includes(titleQuery) : false;
    const matchesContent = contentQuery ? Boolean(indexedContent?.normalizedContentText.includes(contentQuery)) : false;
    return { note, contentText, matchesTitle, matchesContent };
  }).filter(({ note, matchesTitle, matchesContent }) => {
    switch (sidebarView) {
      case 'favorites': if (!note.favorite) return false; break;
      case 'pinned': if (!note.pinned) return false; break;
      case 'folder': if (note.folderId !== (activeFolderId ?? undefined)) return false; break;
      case 'trash': break;
      case 'all': default: break;
    }
    if (activeTag) {
      const tagFilter = activeTag.toLowerCase();
      if (!note.tags.some((tag) => tag.toLowerCase() === tagFilter)) return false;
    }
    if (!titleQuery) return true;
    return matchesTitle || matchesContent;
  });
}

export function sortNotes(results: SearchResult[], sortBy: SortOption, searchQuery: string): SearchResult[] {
  const sorted = [...results];
  const hasSearchQuery = Boolean(searchQuery.trim());
  const baseSort = (a: SearchResult, b: SearchResult) => {
    switch (sortBy) {
      case 'createdAt': return b.note.createdAt - a.note.createdAt;
      case 'title': return a.note.title.localeCompare(b.note.title);
      case 'updatedAt': default:
        if (a.note.pinned && !b.note.pinned) return -1;
        if (!a.note.pinned && b.note.pinned) return 1;
        return b.note.updatedAt - a.note.updatedAt;
    }
  };
  sorted.sort((a, b) => {
    if (hasSearchQuery && a.matchesTitle !== b.matchesTitle) return a.matchesTitle ? -1 : 1;
    return baseSort(a, b);
  });
  return sorted;
}

export function useSearch(notes: Note[]): { results: SearchResult[]; searchIndex: SearchIndex } {
  const { state } = useWorkspace();
  const { searchQuery, sortBy, sidebarView, activeFolderId, activeTag } = state;
  const deferredContentQuery = useDeferredValue(searchQuery);
  const searchIndex = useMemo(() => buildSearchIndex(notes), [notes]);
  const results = useMemo(() => {
    return sortNotes(filterNotes(notes, { searchQuery, sidebarView, activeFolderId, activeTag }, searchIndex, deferredContentQuery), sortBy, searchQuery);
  }, [notes, searchQuery, deferredContentQuery, sortBy, sidebarView, activeFolderId, activeTag, searchIndex]);
  return { results, searchIndex };
}
