import React, { useState, useEffect } from 'react';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { Sidebar } from './components/Sidebar';
import { NotesList } from './components/NotesList';
import { Editor } from './components/Editor';
import { WhiteboardList } from './components/WhiteboardList';
import { WhiteboardCanvas } from './components/WhiteboardCanvas';
import { useLocalPreferences } from './hooks/useLocalPreferences';

function WorkspaceInner() {
  const { getSidebarCollapsed, setSidebarCollapsed } = useLocalPreferences();
  const { state } = useWorkspace();
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');

  useEffect(() => {
    setSidebarCollapsedState(getSidebarCollapsed());
  }, []);

  useEffect(() => {
    if (state.activeNoteId || state.activeWhiteboardId) {
      setMobileView('editor');
    }
  }, [state.activeNoteId, state.activeWhiteboardId]);

  const handleToggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsedState(newState);
    setSidebarCollapsed(newState);
  };

  const isWhiteboardView = state.sidebarView === 'whiteboards' || state.activeWhiteboardId;

  return (
    <div className={`ws-layout ${sidebarCollapsed ? 'ws-layout--sidebar-collapsed' : ''} ${mobileSidebarOpen ? 'ws-layout--mobile-sidebar-open' : ''} ${mobileView === 'editor' ? 'ws-layout--editor-active' : ''}`}>
      <button className="ws-mobile-hamburger" onClick={() => setMobileSidebarOpen(true)} aria-label="Open sidebar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {mobileSidebarOpen && (
        <button className="ws-mobile-backdrop" onClick={() => setMobileSidebarOpen(false)} aria-label="Close sidebar" />
      )}

      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={handleToggleSidebar} onMobileClose={() => setMobileSidebarOpen(false)} />

      <main className={`ws-main ${mobileView === 'editor' ? 'ws-main--editor-active' : ''}`}>
        <div className="ws-main__list">
          {isWhiteboardView ? <WhiteboardList /> : <NotesList />}
        </div>
        <div className="ws-main__editor">
          {mobileView === 'editor' && (
            <button className="ws-main__back-btn" onClick={() => setMobileView('list')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              Back
            </button>
          )}
          {state.activeWhiteboardId ? <WhiteboardCanvas /> : <Editor />}
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <WorkspaceProvider>
      <WorkspaceInner />
    </WorkspaceProvider>
  );
}
