import React, { useEffect, useState } from 'react';

export function Settings({ onClose }: { onClose: () => void }) {
  const [dataPath, setDataPath] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.api.settings.get<string>('dataPath').then((path) => {
      setDataPath(path ?? '~/Documents/NoteAndSave');
      setLoading(false);
    });
  }, []);

  const handleChangeLocation = async () => {
    const selected = await window.api.dialog.selectFolder();
    if (selected) {
      await window.api.settings.set('dataPath', selected);
      setDataPath(selected);
    }
  };

  return (
    <div className="ws-settings-overlay">
      <div className="ws-settings-panel">
        <div className="ws-settings-header">
          <h2 className="ws-settings-title">Settings</h2>
          <button className="ws-settings-close" onClick={onClose} aria-label="Close settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="ws-settings-body">
          <div className="ws-settings-section">
            <h3 className="ws-settings-section-title">Data Storage</h3>
            <p className="ws-settings-description">
              Choose where your notes and whiteboards are stored on disk.
            </p>
            <div className="ws-settings-path-row">
              <code className="ws-settings-path">{loading ? '...' : dataPath}</code>
              <button className="ws-settings-btn" onClick={handleChangeLocation}>
                Change Location
              </button>
            </div>
            <p className="ws-settings-hint">
              Restart the app after changing the data location.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
