import React, { useMemo, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useWhiteboards } from '../hooks/useWhiteboards';
import { WhiteboardCard } from './WhiteboardCard';

export function WhiteboardList() {
  const { state, dispatch } = useWorkspace();
  const {
    whiteboards,
    removeWhiteboard,
    restoreWhiteboard,
    permanentlyDeleteWhiteboard,
    duplicateWhiteboard,
    pinWhiteboard,
    favoriteWhiteboard,
    renameWhiteboard,
  } = useWhiteboards();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredWhiteboards = useMemo(() => {
    let list = whiteboards;

    // Filter by sidebar view
    if (state.sidebarView === 'whiteboards') {
      list = list.filter((w) => !w.deleted);
    } else if (state.sidebarView === 'favorites') {
      list = list.filter((w) => w.favorite && !w.deleted);
    } else if (state.sidebarView === 'pinned') {
      list = list.filter((w) => w.pinned && !w.deleted);
    } else if (state.sidebarView === 'trash') {
      list = list.filter((w) => w.deleted);
    } else {
      list = list.filter((w) => !w.deleted);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((w) => w.title.toLowerCase().includes(q));
    }

    // Sort
    return list.sort((a, b) => {
      if (state.sortBy === 'title') return a.title.localeCompare(b.title);
      if (state.sortBy === 'createdAt') return b.createdAt - a.createdAt;
      return b.updatedAt - a.updatedAt;
    });
  }, [whiteboards, state.sidebarView, state.sortBy, searchQuery]);

  const isTrash = state.sidebarView === 'trash';

  const handleRename = (id: string) => {
    const wb = whiteboards.find((w) => w.id === id);
    if (!wb) return;
    const newTitle = window.prompt('Rename whiteboard:', wb.title);
    if (newTitle && newTitle.trim()) {
      renameWhiteboard(id, newTitle.trim());
    }
  };

  return (
    <div className="ws-wb-list">
      <div className="ws-wb-list__header">
        <input
          className="ws-wb-list__search"
          type="text"
          placeholder="Search whiteboards..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <span className="ws-wb-list__count">
          {filteredWhiteboards.length} whiteboard{filteredWhiteboards.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="ws-wb-list__items">
        {filteredWhiteboards.length === 0 ? (
          <div className="ws-wb-list__empty">
            <p>{isTrash ? 'Trash is empty' : 'No whiteboards yet'}</p>
          </div>
        ) : (
          filteredWhiteboards.map((wb) => (
            <WhiteboardCard
              key={wb.id}
              whiteboard={wb}
              isActive={state.activeWhiteboardId === wb.id}
              onClick={() => dispatch({ type: 'SET_ACTIVE_WHITEBOARD', payload: wb.id })}
              onDelete={isTrash ? () => permanentlyDeleteWhiteboard(wb.id) : () => removeWhiteboard(wb.id)}
              onRename={isTrash ? undefined : () => handleRename(wb.id)}
              onPin={isTrash ? undefined : () => pinWhiteboard(wb.id)}
              onFavorite={isTrash ? undefined : () => favoriteWhiteboard(wb.id)}
              onDuplicate={isTrash ? undefined : () => duplicateWhiteboard(wb.id)}
              onRestore={isTrash ? () => restoreWhiteboard(wb.id) : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
