import React from 'react';
import type { JSONContent } from '@tiptap/react';
import type { Note } from '../types';

interface NoteCardProps {
  note: Note;
  contentText: string;
  matchesTitle?: boolean;
  matchesContent?: boolean;
  searchQuery?: string;
  isActive: boolean;
  onClick: () => void;
  onTagClick?: (tag: string) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onTogglePin?: () => void;
  onToggleFavorite?: () => void;
  onRestore?: () => void;
  renderMenuExtras?: (closeMenu: () => void) => React.ReactNode;
}

function getChecklistProgress(content: JSONContent): { done: number; total: number } | null {
  let done = 0;
  let total = 0;

  function walk(node: JSONContent) {
    if (node.type === 'taskItem') {
      total++;
      if (node.attrs?.checked) done++;
    }
    if (node.content) {
      for (const child of node.content) {
        walk(child);
      }
    }
  }

  walk(content);
  if (total === 0) return null;
  return { done, total };
}

function getRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function getPreviewText(contentText: string): string {
  return contentText.slice(0, 80);
}

function getContentSnippet(contentText: string, searchQuery: string) {
  const query = searchQuery.trim();

  if (!contentText || !query) return null;

  const matchIndex = contentText.toLowerCase().indexOf(query.toLowerCase());
  if (matchIndex === -1) return null;

  const snippetStart = Math.max(0, matchIndex - 28);
  const snippetEnd = Math.min(contentText.length, matchIndex + query.length + 40);
  const relativeMatchStart = matchIndex - snippetStart;
  const relativeMatchEnd = relativeMatchStart + query.length;
  const snippet = contentText.slice(snippetStart, snippetEnd);

  return {
    prefix: snippetStart > 0 ? '…' : '',
    before: snippet.slice(0, relativeMatchStart),
    match: snippet.slice(relativeMatchStart, relativeMatchEnd),
    after: snippet.slice(relativeMatchEnd),
    suffix: snippetEnd < contentText.length ? '…' : '',
  };
}

export function NoteCard({
  note,
  contentText,
  matchesTitle = false,
  matchesContent = false,
  searchQuery = '',
  isActive,
  onClick,
  onTagClick,
  onDelete,
  onDuplicate,
  onTogglePin,
  onToggleFavorite,
  onRestore,
  renderMenuExtras,
}: NoteCardProps) {
  const progress = getChecklistProgress(note.content);
  const [showMenu, setShowMenu] = React.useState(false);
  const preview = React.useMemo(() => getPreviewText(contentText), [contentText]);
  const closeMenu = () => setShowMenu(false);
  const contentSnippet = React.useMemo(() => {
    if (!matchesContent || matchesTitle) {
      return null;
    }

    return getContentSnippet(contentText, searchQuery);
  }, [contentText, matchesContent, matchesTitle, searchQuery]);

  return (
    <div
      className={`ws-note-card ${isActive ? 'ws-note-card--active' : ''} ${note.pinned ? 'ws-note-card--pinned' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
    >
      <div className="ws-note-card__header">
        <h4 className="ws-note-card__title">
          {note.pinned && (
            <svg className="ws-note-card__pin-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
            </svg>
          )}
          {note.title}
        </h4>
        <div className="ws-note-card__actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="ws-note-card__menu-btn"
            onClick={() => setShowMenu(!showMenu)}
            aria-label="Note actions"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
          {showMenu && (
            <div className="ws-note-card__menu" onMouseLeave={closeMenu}>
              {onTogglePin && (
                <button onClick={() => { onTogglePin(); closeMenu(); }}>
                  {note.pinned ? 'Unpin' : 'Pin'}
                </button>
              )}
              {onToggleFavorite && (
                <button onClick={() => { onToggleFavorite(); closeMenu(); }}>
                  {note.favorite ? 'Unfavorite' : 'Favorite'}
                </button>
              )}
              {onDuplicate && (
                <button onClick={() => { onDuplicate(); closeMenu(); }}>
                  Duplicate
                </button>
              )}
              {renderMenuExtras?.(closeMenu)}
              {onRestore && (
                <button onClick={() => { onRestore(); closeMenu(); }}>
                  Restore
                </button>
              )}
              {onDelete && (
                <button className="ws-note-card__menu-delete" onClick={() => { onDelete(); closeMenu(); }}>
                  {note.deleted ? 'Delete Forever' : 'Delete'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {(contentSnippet || preview) && (
        <p className="ws-note-card__preview">
          {contentSnippet ? (
            <>
              {contentSnippet.prefix}
              {contentSnippet.before}
              <mark className="ws-note-card__highlight">{contentSnippet.match}</mark>
              {contentSnippet.after}
              {contentSnippet.suffix}
            </>
          ) : (
            preview
          )}
        </p>
      )}

      <div className="ws-note-card__footer">
        <div className="ws-note-card__meta">
          <span className="ws-note-card__time">{getRelativeTime(note.updatedAt)}</span>
          {progress && (
            <span className="ws-note-card__progress">
              {progress.done}/{progress.total}
            </span>
          )}
          {note.favorite && (
            <svg className="ws-note-card__fav-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          )}
        </div>
        {note.tags.length > 0 && (
          <div className="ws-note-card__tags">
            {note.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="ws-tag ws-tag--sm ws-tag--interactive"
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(tag);
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
