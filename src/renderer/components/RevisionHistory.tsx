import React, { useEffect, useMemo, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { getRevisions, type Revision } from '../lib/db';

interface RevisionHistoryProps {
  isOpen: boolean;
  noteId: string;
  onClose: () => void;
  onRestore: (revision: Revision) => void;
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function extractText(content: JSONContent): string {
  let text = content.text ?? '';

  for (const child of content.content ?? []) {
    const childText = extractText(child).trim();
    if (childText) {
      text += (text ? '\n' : '') + childText;
    }
  }

  return text;
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = timestamp - Date.now();
  const absDiffMs = Math.abs(diffMs);

  if (absDiffMs < 60_000) {
    return relativeTimeFormatter.format(Math.round(diffMs / 1000), 'second');
  }

  if (absDiffMs < 3_600_000) {
    return relativeTimeFormatter.format(Math.round(diffMs / 60_000), 'minute');
  }

  if (absDiffMs < 86_400_000) {
    return relativeTimeFormatter.format(Math.round(diffMs / 3_600_000), 'hour');
  }

  return relativeTimeFormatter.format(Math.round(diffMs / 86_400_000), 'day');
}

export function RevisionHistory({ isOpen, noteId, onClose, onRestore }: RevisionHistoryProps) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setIsLoading(true);

    getRevisions(noteId)
      .then((items) => {
        if (cancelled) return;
        setRevisions(items);
        setSelectedRevisionId((currentId) => {
          if (currentId && items.some((item) => item.id === currentId)) {
            return currentId;
          }
          return items[0]?.id ?? null;
        });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, noteId]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const selectedRevision = useMemo(
    () => revisions.find((revision) => revision.id === selectedRevisionId) ?? null,
    [revisions, selectedRevisionId],
  );

  const previewText = selectedRevision
    ? extractText(selectedRevision.content).trim() || 'No text preview available for this revision.'
    : 'Select a revision to preview it.';

  if (!isOpen) return null;

  return (
    <div className="ws-revision-history" role="dialog" aria-modal="true" aria-label="Revision history">
      <button className="ws-revision-history__backdrop" onClick={onClose} aria-label="Close revision history" />
      <div className="ws-revision-history__panel">
        <div className="ws-revision-history__header">
          <div>
            <h3 className="ws-revision-history__title">Revision history</h3>
            <p className="ws-revision-history__subtitle">Snapshots are saved every 5 minutes while editing.</p>
          </div>
          <button className="ws-revision-history__close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="ws-revision-history__body">
          <div className="ws-revision-history__list">
            {isLoading ? (
              <div className="ws-revision-history__empty">Loading revisions…</div>
            ) : revisions.length === 0 ? (
              <div className="ws-revision-history__empty">No revisions yet.</div>
            ) : (
              revisions.map((revision) => (
                <button
                  key={revision.id}
                  className={[
                    'ws-revision-history__item',
                    selectedRevisionId === revision.id ? 'ws-revision-history__item--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setSelectedRevisionId(revision.id)}
                >
                  <span className="ws-revision-history__item-time" title={new Date(revision.timestamp).toLocaleString()}>
                    {formatRelativeTime(revision.timestamp)}
                  </span>
                  <span className="ws-revision-history__item-title">{revision.title || 'Untitled'}</span>
                </button>
              ))
            )}
          </div>

          <div className="ws-revision-history__preview">
            <div className="ws-revision-history__preview-header">
              <div>
                <h4>{selectedRevision?.title || 'Revision preview'}</h4>
                {selectedRevision && (
                  <span title={new Date(selectedRevision.timestamp).toLocaleString()}>
                    {formatRelativeTime(selectedRevision.timestamp)}
                  </span>
                )}
              </div>
              <button
                className="ws-revision-history__restore"
                onClick={() => selectedRevision && onRestore(selectedRevision)}
                disabled={!selectedRevision}
              >
                Restore
              </button>
            </div>
            <pre className="ws-revision-history__preview-content">{previewText}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
