import React from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { SortOption } from '../types';

export function Search() {
  const { state, dispatch } = useWorkspace();

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: e.target.value });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch({ type: 'SET_SORT_BY', payload: e.target.value as SortOption });
  };

  return (
    <div className="ws-search">
      <div className="ws-search__input-wrapper">
        <svg className="ws-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          className="ws-search__input"
          placeholder="Search notes..."
          value={state.searchQuery}
          onChange={handleSearchChange}
          aria-label="Search notes"
        />
        {state.searchQuery && (
          <button
            className="ws-search__clear"
            onClick={() => dispatch({ type: 'SET_SEARCH_QUERY', payload: '' })}
            aria-label="Clear search"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <select
        className="ws-search__sort"
        value={state.sortBy}
        onChange={handleSortChange}
        aria-label="Sort notes"
      >
        <option value="updatedAt">Recently Updated</option>
        <option value="createdAt">Recently Created</option>
        <option value="title">Alphabetical</option>
      </select>
    </div>
  );
}
