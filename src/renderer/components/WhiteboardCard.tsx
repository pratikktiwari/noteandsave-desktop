import React from 'react';
import type { Whiteboard } from '../types';

interface WhiteboardCardProps {
  whiteboard: Whiteboard;
  isActive: boolean;
  isRenaming?: boolean;
  renameValue?: string;
  onRenameChange?: (value: string) => void;
  onRenameSubmit?: () => void;
  onRenameCancel?: () => void;
  onClick: () => void;
  onDelete?: () => void;
  onRename?: () => void;
  onPin?: () => void;
  onFavorite?: () => void;
  onDuplicate?: () => void;
  onRestore?: () => void;
}

function formatRelativeTime(timestamp: number): string {
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

export function WhiteboardCard({
  whiteboard,
  isActive,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onClick,
  onDelete,
  onRename,
  onPin,
  onFavorite,
  onDuplicate,
  onRestore,
}: WhiteboardCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);

  return (
    <div
      className={`ws-wb-card ${isActive ? 'ws-wb-card--active' : ''}`}
      onClick={onClick}
    >
      <div className="ws-wb-card__icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
      <div className="ws-wb-card__content">
        {isRenaming ? (
          <input
            className="ws-wb-card__rename-input"
            type="text"
            value={renameValue || ''}
            onChange={(e) => onRenameChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameSubmit?.();
              if (e.key === 'Escape') onRenameCancel?.();
            }}
            onBlur={() => onRenameSubmit?.()}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <span className="ws-wb-card__title">{whiteboard.title}</span>
        )}
        <span className="ws-wb-card__meta">
          {whiteboard.pinned && '📌 '}
          {whiteboard.favorite && '⭐ '}
          {formatRelativeTime(whiteboard.updatedAt)}
        </span>
      </div>
      <div className="ws-wb-card__actions">
        <button
          className="ws-wb-card__menu-btn"
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          aria-label="More actions"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
        {showMenu && (
          <div className="ws-wb-card__menu" onMouseLeave={() => setShowMenu(false)}>
            {onRename && <button onClick={(e) => { e.stopPropagation(); onRename(); setShowMenu(false); }}>Rename</button>}
            {onDuplicate && <button onClick={(e) => { e.stopPropagation(); onDuplicate(); setShowMenu(false); }}>Duplicate</button>}
            {onPin && <button onClick={(e) => { e.stopPropagation(); onPin(); setShowMenu(false); }}>{whiteboard.pinned ? 'Unpin' : 'Pin'}</button>}
            {onFavorite && <button onClick={(e) => { e.stopPropagation(); onFavorite(); setShowMenu(false); }}>{whiteboard.favorite ? 'Unfavorite' : 'Favorite'}</button>}
            {onRestore && <button onClick={(e) => { e.stopPropagation(); onRestore(); setShowMenu(false); }}>Restore</button>}
            {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }} className="ws-wb-card__menu-delete">Delete</button>}
          </div>
        )}
      </div>
    </div>
  );
}
