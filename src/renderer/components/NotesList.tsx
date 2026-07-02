import React from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useNotes } from '../hooks/useNotes';
import { filterNotes, useSearch } from '../hooks/useSearch';
import { Search } from './Search';
import { NoteCard } from './NoteCard';

function collectTags(tags: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const rawTag of tags) {
    const tag = rawTag.trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    unique.push(tag);
  }

  return unique.sort((a, b) => a.localeCompare(b));
}

export function NotesList() {
  const { state, dispatch } = useWorkspace();
  const { notes, moveToFolder, removeNote, duplicate, togglePin, toggleFavorite, restore, permanentDelete } = useNotes();
  const { results: filteredNotes, searchIndex } = useSearch(notes);
  const availableTags = React.useMemo(() => {
    const tagSource = filterNotes(notes, {
      searchQuery: state.searchQuery,
      sidebarView: state.sidebarView,
      activeFolderId: state.activeFolderId,
      activeTag: null,
    }, searchIndex);

    return collectTags(tagSource.flatMap(({ note }) => note.tags));
  }, [notes, searchIndex, state.searchQuery, state.sidebarView, state.activeFolderId]);

  const handleSelectNote = (id: string) => {
    dispatch({ type: 'SET_ACTIVE_NOTE', payload: id });
  };

  const handleTagFilter = (tag: string) => {
    dispatch({
      type: 'SET_ACTIVE_TAG',
      payload: state.activeTag?.toLowerCase() === tag.toLowerCase() ? null : tag,
    });
  };

  return (
    <div className="ws-notes-list">
      <Search />
      <div className="ws-notes-list__privacy-banner">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Your data stays in your browser — never sent to any server.
      </div>
      <div className="ws-notes-list__header">
        <span className="ws-notes-list__count">
          {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
        </span>
        {availableTags.length > 0 && (
          <div className="ws-notes-list__filters">
            <div className="ws-notes-list__filters-header">
              <span className="ws-notes-list__filters-label">Filter by tag</span>
              {state.activeTag && (
                <button
                  type="button"
                  className="ws-notes-list__filters-clear"
                  onClick={() => dispatch({ type: 'SET_ACTIVE_TAG', payload: null })}
                >
                  Clear
                </button>
              )}
            </div>
            <div className="ws-notes-list__filters-tags">
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`ws-tag ws-tag--sm ws-tag--interactive ${state.activeTag?.toLowerCase() === tag.toLowerCase() ? 'ws-tag--active' : ''}`}
                  onClick={() => handleTagFilter(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="ws-notes-list__items">
        {state.isLoading ? (
          <div className="ws-notes-list__empty">Loading...</div>
        ) : filteredNotes.length === 0 ? (
          <div className="ws-notes-list__empty">
            {state.searchQuery || state.activeTag ? 'No matching notes' : 'No notes yet'}
          </div>
        ) : (
          filteredNotes.map(({ note, contentText, matchesTitle, matchesContent }) => (
            <NoteCard
              key={note.id}
              note={note}
              contentText={contentText}
              matchesTitle={matchesTitle}
              matchesContent={matchesContent}
              searchQuery={state.searchQuery}
              isActive={state.activeNoteId === note.id}
              onClick={() => handleSelectNote(note.id)}
              onTagClick={handleTagFilter}
              onDelete={note.type !== 'scratchpad' ? () => state.sidebarView === 'trash' ? permanentDelete(note.id) : removeNote(note.id) : undefined}
              onDuplicate={state.sidebarView !== 'trash' ? () => duplicate(note.id) : undefined}
              onTogglePin={state.sidebarView !== 'trash' ? () => togglePin(note.id) : undefined}
              onToggleFavorite={state.sidebarView !== 'trash' ? () => toggleFavorite(note.id) : undefined}
              onRestore={state.sidebarView === 'trash' ? () => restore(note.id) : undefined}
              renderMenuExtras={state.sidebarView !== 'trash' ? (closeMenu) => (
                <>
                  <div className="ws-note-card__menu-separator" />
                  <div className="ws-note-card__menu-label">Move to folder</div>
                  <button
                    onClick={() => {
                      moveToFolder(note.id, null);
                      closeMenu();
                    }}
                  >
                    {note.folderId ? 'No folder' : '✓ No folder'}
                  </button>
                  {state.folders.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => {
                        moveToFolder(note.id, folder.id);
                        closeMenu();
                      }}
                    >
                      {note.folderId === folder.id ? `✓ ${folder.name}` : folder.name}
                    </button>
                  ))}
                </>
              ) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
