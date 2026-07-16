import React from 'react';
import type { JSONContent } from '@tiptap/react';
import type { Note } from '../types';

interface NotesGridProps {
  notes: Array<{ note: Note; contentText: string }>;
  isLoading: boolean;
  searchQuery: string;
  activeTag: string | null;
  onSelectNote: (id: string) => void;
  onTagClick: (tag: string) => void;
}

function getPreviewLines(contentText: string): string {
  return contentText.slice(0, 150);
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
      for (const child of node.content) walk(child);
    }
  }
  walk(content);
  return total === 0 ? null : { done, total };
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

export function NotesGrid({ notes, isLoading, searchQuery, activeTag, onSelectNote, onTagClick }: NotesGridProps) {
  if (isLoading) {
    return <div className="ws-notes-grid__empty">Loading...</div>;
  }

  if (notes.length === 0) {
    return (
      <div className="ws-notes-grid__empty">
        {searchQuery || activeTag ? 'No matching notes' : 'No notes yet'}
      </div>
    );
  }

  return (
    <div className="ws-notes-grid">
      {notes.map(({ note, contentText }) => {
        const progress = getChecklistProgress(note.content);
        const preview = getPreviewLines(contentText);

        return (
          <div
            key={note.id}
            className={`ws-notes-grid__card ${note.pinned ? 'ws-notes-grid__card--pinned' : ''}`}
            onClick={() => onSelectNote(note.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onSelectNote(note.id); }}
          >
            <div className="ws-notes-grid__card-header">
              <h4 className="ws-notes-grid__card-title">
                {note.pinned && <span className="ws-notes-grid__pin">📌</span>}
                {note.favorite && <span className="ws-notes-grid__fav">★</span>}
                {note.title || 'Untitled'}
              </h4>
              <span className="ws-notes-grid__card-time">{getRelativeTime(note.updatedAt)}</span>
            </div>

            {preview && (
              <p className="ws-notes-grid__card-preview">{preview}</p>
            )}

            {progress && (
              <div className="ws-notes-grid__card-progress">
                <div className="ws-notes-grid__card-progress-bar">
                  <div
                    className="ws-notes-grid__card-progress-fill"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
                <span className="ws-notes-grid__card-progress-text">
                  {progress.done}/{progress.total}
                </span>
              </div>
            )}

            {note.tags.length > 0 && (
              <div className="ws-notes-grid__card-tags">
                {note.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="ws-tag ws-tag--sm"
                    onClick={(e) => { e.stopPropagation(); onTagClick(tag); }}
                  >
                    {tag}
                  </span>
                ))}
                {note.tags.length > 3 && (
                  <span className="ws-notes-grid__card-tags-more">+{note.tags.length - 3}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
