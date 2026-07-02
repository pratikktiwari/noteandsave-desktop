import React, { useState } from "react";
import { useWorkspace } from "../context/WorkspaceContext";
import { useFolders } from "../hooks/useFolders";
import { useNotes } from "../hooks/useNotes";
import { useWhiteboards } from "../hooks/useWhiteboards";
import { useLocalPreferences } from "../hooks/useLocalPreferences";
import { Settings } from "./Settings";
import type { SidebarView } from "../types";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onMobileClose?: () => void;
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  onMobileClose,
}: SidebarProps) {
  const { state, dispatch } = useWorkspace();
  const { folders, addFolder, loadFolders, removeFolder, renameFolder } =
    useFolders();
  const { addNote, clearFolderFromNotes } = useNotes();
  const { addWhiteboard } = useWhiteboards();
  const { toggleTheme } = useLocalPreferences();
  const [foldersOpen, setFoldersOpen] = React.useState(true);
  const [menuFolderId, setMenuFolderId] = React.useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  React.useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const setView = (view: SidebarView) => {
    if (view !== "folder") {
      dispatch({ type: "SET_ACTIVE_FOLDER", payload: null });
    }
    dispatch({ type: "SET_SIDEBAR_VIEW", payload: view });
    dispatch({ type: "SET_ACTIVE_NOTE", payload: null });
    if (view !== "whiteboards") {
      dispatch({ type: "SET_ACTIVE_WHITEBOARD", payload: null });
    }
  };

  const handleNewNote = () => addNote("note");
  const handleNewChecklist = () => addNote("checklist");
  const openScratchpad = () => {
    dispatch({ type: "SET_ACTIVE_NOTE", payload: "scratchpad-permanent" });
    dispatch({ type: "SET_ACTIVE_FOLDER", payload: null });
    dispatch({ type: "SET_SIDEBAR_VIEW", payload: "all" });
  };

  const handleCreateFolder = async () => {
    setCreatingFolder(true);
    setNewFolderName('');
    setFoldersOpen(true);
  };

  const handleSubmitNewFolder = async () => {
    const name = newFolderName.trim();
    setCreatingFolder(false);
    setNewFolderName('');
    if (!name) return;

    const folder = await addFolder(name);
    if (!folder) return;

    dispatch({ type: "SET_ACTIVE_FOLDER", payload: folder.id });
    dispatch({ type: "SET_SIDEBAR_VIEW", payload: "folder" });
  };

  const handleSelectFolder = (folderId: string) => {
    dispatch({ type: "SET_ACTIVE_FOLDER", payload: folderId });
    dispatch({ type: "SET_SIDEBAR_VIEW", payload: "folder" });
  };

  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');

  const handleRenameFolder = async (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;
    setRenamingFolderId(folderId);
    setRenameFolderValue(folder.name);
    setMenuFolderId(null);
  };

  const handleSubmitRename = async () => {
    const name = renameFolderValue.trim();
    const folderId = renamingFolderId;
    setRenamingFolderId(null);
    setRenameFolderValue('');
    if (!folderId || !name) return;
    const folder = folders.find((item) => item.id === folderId);
    if (!folder || name === folder.name) return;
    await renameFolder(folderId, name);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder) return;

    await clearFolderFromNotes(folderId);
    await removeFolder(folderId);
    setMenuFolderId(null);
  };

  if (collapsed) {
    return (
      <aside className="ws-sidebar ws-sidebar--collapsed">
        <button
          className="ws-sidebar__toggle"
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="ws-sidebar">
      <div className="ws-sidebar__header">
        <h3 className="ws-sidebar__title">Workspace</h3>
        <div className="ws-sidebar__header-actions">
          <button
            className="ws-sidebar__toggle"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          {onMobileClose && (
            <button
              className="ws-sidebar__mobile-close"
              onClick={onMobileClose}
              aria-label="Close sidebar"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="ws-sidebar__actions">
        <button
          className="ws-sidebar__btn ws-sidebar__btn--primary"
          onClick={handleNewNote}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Note
        </button>
        <button className="ws-sidebar__btn" onClick={handleNewChecklist}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          Quick Checklist
        </button>
        <button className="ws-sidebar__btn" onClick={handleCreateFolder}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2H3z" />
            <path d="M3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <path d="M12 13v4M10 15h4" />
          </svg>
          New Folder
        </button>
        <button className="ws-sidebar__btn" onClick={() => addWhiteboard()}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          New Whiteboard
        </button>
      </div>

      <nav className="ws-sidebar__nav">
        <button
          className={`ws-sidebar__nav-item ${state.sidebarView === "all" && state.activeNoteId !== "scratchpad-permanent" ? "ws-sidebar__nav-item--active" : ""}`}
          onClick={() => setView("all")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          All Notes
        </button>

        <button className={`ws-sidebar__nav-item${state.activeNoteId === 'scratchpad-permanent' ? ' ws-sidebar__nav-item--active' : ''}`} onClick={openScratchpad}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Scratchpad
        </button>

        <button
          className={`ws-sidebar__nav-item ${state.sidebarView === "favorites" ? "ws-sidebar__nav-item--active" : ""}`}
          onClick={() => setView("favorites")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          Favorites
        </button>

        <button
          className={`ws-sidebar__nav-item ${state.sidebarView === "pinned" ? "ws-sidebar__nav-item--active" : ""}`}
          onClick={() => setView("pinned")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
          </svg>
          Pinned
        </button>

        <div className="ws-sidebar__separator" />

        <button
          className={`ws-sidebar__nav-item ${state.sidebarView === "whiteboards" ? "ws-sidebar__nav-item--active" : ""}`}
          onClick={() => setView("whiteboards")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Whiteboards
        </button>

        <div className="ws-sidebar__separator" />

        <button
          className={`ws-sidebar__nav-item ${state.sidebarView === "trash" ? "ws-sidebar__nav-item--active" : ""}`}
          onClick={() => setView("trash")}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Trash
        </button>
      </nav>

      <div className="ws-sidebar__folders">
        <button
          className="ws-sidebar__section-header"
          onClick={() => setFoldersOpen((open) => !open)}
          aria-expanded={foldersOpen}
        >
          <span className="ws-sidebar__section-title">Folders</span>
          <svg
            className={`ws-sidebar__section-icon ${foldersOpen ? "ws-sidebar__section-icon--open" : ""}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>

        {foldersOpen && (
          <div className="ws-sidebar__folder-list">
            {creatingFolder && (
              <div className="ws-sidebar__folder-item">
                <input
                  className="ws-sidebar__folder-input"
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSubmitNewFolder();
                    if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
                  }}
                  onBlur={handleSubmitNewFolder}
                  placeholder="Folder name..."
                  autoFocus
                />
              </div>
            )}
            {folders.length === 0 && !creatingFolder ? (
              <div className="ws-sidebar__folder-empty">No folders yet</div>
            ) : (
              folders.map((folder) => {
                const isActive =
                  state.sidebarView === "folder" &&
                  state.activeFolderId === folder.id;

                return (
                  <div
                    key={folder.id}
                    className={`ws-sidebar__folder-item ${isActive ? "ws-sidebar__folder-item--active" : ""}`}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setMenuFolderId((current) =>
                        current === folder.id ? null : folder.id,
                      );
                    }}
                  >
                    {renamingFolderId === folder.id ? (
                      <input
                        className="ws-sidebar__folder-input"
                        type="text"
                        value={renameFolderValue}
                        onChange={(e) => setRenameFolderValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSubmitRename();
                          if (e.key === 'Escape') { setRenamingFolderId(null); setRenameFolderValue(''); }
                        }}
                        onBlur={handleSubmitRename}
                        autoFocus
                      />
                    ) : (
                    <button
                      className="ws-sidebar__folder-button"
                      onClick={() => handleSelectFolder(folder.id)}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2H3z" />
                        <path d="M3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      </svg>
                      <span className="ws-sidebar__folder-name">
                        {folder.name}
                      </span>
                    </button>
                    )}
                    <div className="ws-sidebar__folder-actions">
                      <button
                        className="ws-sidebar__folder-menu-btn"
                        onClick={() =>
                          setMenuFolderId((current) =>
                            current === folder.id ? null : folder.id,
                          )
                        }
                        aria-label={`Manage ${folder.name}`}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <circle cx="12" cy="5" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>
                      {menuFolderId === folder.id && (
                        <div
                          className="ws-sidebar__folder-menu"
                          onMouseLeave={() => setMenuFolderId(null)}
                        >
                          <button onClick={() => handleRenameFolder(folder.id)}>
                            Rename
                          </button>
                          <button
                            className="ws-sidebar__folder-menu-delete"
                            onClick={() => handleDeleteFolder(folder.id)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="ws-sidebar__footer">
        <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
          <svg
            width="20"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          >
            <path
              className="sun"
              fillRule="evenodd"
              d="M12 17.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zm0 1.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm12-7a.8.8 0 0 1-.8.8h-2.4a.8.8 0 0 1 0-1.6h2.4a.8.8 0 0 1 .8.8zM4 12a.8.8 0 0 1-.8.8H.8a.8.8 0 0 1 0-1.6h2.5a.8.8 0 0 1 .8.8zm16.5-8.5a.8.8 0 0 1 0 1l-1.8 1.8a.8.8 0 0 1-1-1l1.7-1.8a.8.8 0 0 1 1 0zM6.3 17.7a.8.8 0 0 1 0 1l-1.7 1.8a.8.8 0 1 1-1-1l1.7-1.8a.8.8 0 0 1 1 0zM12 0a.8.8 0 0 1 .8.8v2.5a.8.8 0 0 1-1.6 0V.8A.8.8 0 0 1 12 0zm0 20a.8.8 0 0 1 .8.8v2.4a.8.8 0 0 1-1.6 0v-2.4a.8.8 0 0 1 .8-.8zM3.5 3.5a.8.8 0 0 1 1 0l1.8 1.8a.8.8 0 1 1-1 1L3.5 4.6a.8.8 0 0 1 0-1zm14.2 14.2a.8.8 0 0 1 1 0l1.8 1.7a.8.8 0 0 1-1 1l-1.8-1.7a.8.8 0 0 1 0-1z"
            />
            <path
              className="moon"
              fillRule="evenodd"
              d="M16.5 6A10.5 10.5 0 0 1 4.7 16.4 8.5 8.5 0 1 0 16.4 4.7l.1 1.3zm-1.7-2a9 9 0 0 1 .2 2 9 9 0 0 1-11 8.8 9.4 9.4 0 0 1-.8-.3c-.4 0-.8.3-.7.7a10 10 0 0 0 .3.8 10 10 0 0 0 9.2 6 10 10 0 0 0 4-19.2 9.7 9.7 0 0 0-.9-.3c-.3-.1-.7.3-.6.7a9 9 0 0 1 .3.8z"
            />
          </svg>
        </button>
        <button className="theme-toggle" onClick={() => setShowSettings(true)} aria-label="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-1.42 3.42 2 2 0 0 1-1.41-.59l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-3.42-1.42 2 2 0 0 1 .59-1.41l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <div className="ws-sidebar__social">
          <a
            href="https://github.com/pratikktiwari"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
          >
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <a
            href="https://linkedin.com/in/pratikktiwari"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
          >
            <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
              <path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854V1.146zm4.943 12.248V6.169H2.542v7.225h2.401zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248-.822 0-1.359.54-1.359 1.248 0 .694.521 1.248 1.327 1.248h.016zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016l.016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225h2.4z" />
            </svg>
          </a>
          <a
            href="https://x.com/pratikktiwari"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M17.53 2H21L13.47 10.62 22 22h-6.56l-5.14-6.79L4.53 22H1l8.04-9.09L1 2h6.72l4.67 6.17L17.53 2zm-1.21 17.2h1.81L7.04 4.62H5.11z" />
            </svg>
          </a>
        </div>
      </div>
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </aside>
  );
}
