import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { NoteLinkItem } from '../lib/note-link-suggestion';

interface NoteLinkSuggestionMenuProps {
  items: NoteLinkItem[];
  command: (item: NoteLinkItem) => void;
}

export const NoteLinkSuggestionMenu = forwardRef<any, NoteLinkSuggestionMenuProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (items.length === 0) return false;
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          const item = items[selectedIndex];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="ws-note-link-menu">
          <div className="ws-note-link-menu__empty">No notes found</div>
        </div>
      );
    }

    return (
      <div className="ws-note-link-menu">
        {items.map((item, index) => (
          <button
            key={item.id}
            className={`ws-note-link-menu__item ${index === selectedIndex ? 'ws-note-link-menu__item--active' : ''}`}
            onClick={() => command(item)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <svg className="ws-note-link-menu__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="ws-note-link-menu__title">{item.title}</span>
          </button>
        ))}
      </div>
    );
  }
);

NoteLinkSuggestionMenu.displayName = 'NoteLinkSuggestionMenu';
