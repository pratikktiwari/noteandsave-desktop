import React, { useEffect, useState } from 'react';

type ProviderType = 'ollama' | 'lmstudio' | 'openai' | 'gemini';

interface AiConfig {
  provider: ProviderType;
  endpoint: string;
  apiKey: string;
  model: string;
  contextLimit?: number;
  noteCharLimit?: number;
}

type GitSyncStatus = Awaited<ReturnType<typeof window.api.gitSync.status>>;

const PROVIDER_LABELS: Record<ProviderType, string> = {
  ollama: 'Ollama (Local)',
  lmstudio: 'LM Studio (Local)',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
};

const PROVIDER_DEFAULTS: Record<ProviderType, { endpoint: string; model: string; needsKey: boolean }> = {
  ollama: { endpoint: 'http://localhost:11434', model: 'llama3', needsKey: false },
  lmstudio: { endpoint: 'http://localhost:1234', model: 'default', needsKey: false },
  openai: { endpoint: 'https://api.openai.com', model: 'gpt-4o-mini', needsKey: true },
  gemini: { endpoint: '', model: 'gemini-2.0-flash', needsKey: true },
};

export function Settings({ onClose }: { onClose: () => void }) {
  const [dataPath, setDataPath] = useState<string>('');
  const [storageMode, setStorageMode] = useState<'sqlite' | 'files'>('sqlite');
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitSyncStatus | null>(null);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [gitBranch, setGitBranch] = useState('main');
  const [gitToken, setGitToken] = useState('');
  const [gitBusy, setGitBusy] = useState(false);
  const [gitActionError, setGitActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // AI settings
  const [aiConfig, setAiConfig] = useState<AiConfig>({
    provider: 'ollama', endpoint: 'http://localhost:11434', apiKey: '', model: 'llama3',
  });
  const [aiLoading, setAiLoading] = useState(true);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      window.api.settings.get<string>('dataPath'),
      window.api.workspace.status(),
      window.api.gitSync.status(),
      window.api.ai.getConfig(),
    ]).then(([path, storage, syncStatus, config]) => {
      setDataPath(storage.mode === 'files' ? storage.workspacePath : (path as string) ?? storage.legacyDbPath);
      setStorageMode(storage.mode);
      setGitStatus(syncStatus);
      setRepositoryUrl(syncStatus.repositoryUrl ?? '');
      setGitBranch(syncStatus.branch ?? 'main');
      setLoading(false);
      setAiConfig(config as AiConfig);
      setAiLoading(false);
    });
    return window.api.gitSync.onStatus(setGitStatus);
  }, []);

  const handleMigration = async () => {
    setMigrating(true);
    setMigrationError(null);
    try {
      const storage = await window.api.workspace.migrate();
      setStorageMode(storage.mode);
      setDataPath(storage.workspacePath);
      window.location.reload();
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : String(error));
    } finally {
      setMigrating(false);
    }
  };

  const handleLinkRepository = async () => {
    setGitBusy(true);
    try {
      const nextStatus = await window.api.gitSync.link({
        repositoryUrl: repositoryUrl.trim(),
        branch: gitBranch.trim() || 'main',
        token: gitToken,
      });
      setGitStatus(nextStatus);
      if (nextStatus.state !== 'error') setGitToken('');
    } finally {
      setGitBusy(false);
    }
  };

  const handleSyncNow = async () => {
    setGitBusy(true);
    try {
      setGitStatus(await window.api.gitSync.now());
    } finally {
      setGitBusy(false);
    }
  };

  const handleUnlinkRepository = async () => {
    setGitBusy(true);
    try {
      setGitStatus(await window.api.gitSync.unlink());
      setGitToken('');
    } finally {
      setGitBusy(false);
    }
  };

  const handleSyncIntervalChange = async (minutes: number) => {
    setGitBusy(true);
    setGitActionError(null);
    try {
      setGitStatus(await window.api.gitSync.setInterval(minutes));
    } catch (error) {
      setGitActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setGitBusy(false);
    }
  };

  const handleProviderChange = (provider: ProviderType) => {
    const defaults = PROVIDER_DEFAULTS[provider];
    setAiConfig({ provider, endpoint: defaults.endpoint, model: defaults.model, apiKey: '' });
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.api.ai.testConnection(aiConfig);
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message });
    }
    setTesting(false);
  };

  const handleSaveAi = async () => {
    setSaving(true);
    await window.api.ai.setConfig(aiConfig);
    setSaving(false);
  };

  const needsKey = PROVIDER_DEFAULTS[aiConfig.provider]?.needsKey;

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
            </div>
            <p className="ws-settings-hint">
              Storage format: {storageMode === 'files' ? 'Markdown files' : 'SQLite (legacy)'}
            </p>
            {storageMode === 'sqlite' && (
              <>
                <p className="ws-settings-description">
                  GitHub sync requires file storage. Migration creates a backup and keeps your current database unchanged.
                </p>
                <button className="ws-settings-btn ws-settings-btn--primary" onClick={handleMigration} disabled={migrating}>
                  {migrating ? 'Migrating...' : 'Migrate to File Storage'}
                </button>
                {migrationError && (
                  <p className="ws-settings-test-result ws-settings-test-result--error">{migrationError}</p>
                )}
              </>
            )}
          </div>

          <div className="ws-settings-section">
            <h3 className="ws-settings-section-title">GitHub Sync</h3>
            {storageMode === 'sqlite' ? (
              <p className="ws-settings-description">
                Migrate to file storage before linking a GitHub repository.
              </p>
            ) : !gitStatus?.repositoryUrl ? (
              <div className="ws-settings-ai">
                <p className="ws-settings-description">
                  Link a dedicated GitHub repository. Your token is encrypted using OS secure storage.
                </p>
                <div className="ws-settings-field">
                  <label className="ws-settings-label">Repository URL</label>
                  <input
                    className="ws-settings-input"
                    type="url"
                    value={repositoryUrl}
                    onChange={(event) => setRepositoryUrl(event.target.value)}
                    placeholder="https://github.com/username/notes.git"
                  />
                </div>
                <div className="ws-settings-field">
                  <label className="ws-settings-label">Branch</label>
                  <input
                    className="ws-settings-input"
                    value={gitBranch}
                    onChange={(event) => setGitBranch(event.target.value)}
                    placeholder="main"
                  />
                </div>
                <div className="ws-settings-field">
                  <label className="ws-settings-label">Personal access token</label>
                  <input
                    className="ws-settings-input"
                    type="password"
                    value={gitToken}
                    onChange={(event) => setGitToken(event.target.value)}
                    autoComplete="off"
                  />
                </div>
                <button
                  className="ws-settings-btn ws-settings-btn--primary"
                  onClick={handleLinkRepository}
                  disabled={gitBusy || !repositoryUrl.trim() || !gitToken}
                >
                  {gitBusy ? 'Linking...' : 'Link Repository'}
                </button>
              </div>
            ) : (
              <div className="ws-settings-ai">
                <p className="ws-settings-description">
                  {gitStatus?.repositoryUrl} ({gitStatus?.branch})
                </p>
                <p className="ws-settings-hint">
                  Status: {gitStatus?.state}
                  {gitStatus?.lastSyncedAt ? ` · Last synced ${new Date(gitStatus.lastSyncedAt).toLocaleString()}` : ''}
                </p>
                {gitStatus?.conflictCount ? (
                  <p className="ws-settings-test-result ws-settings-test-result--error">
                    Preserved {gitStatus.conflictCount} conflicting item(s) as conflict copies.
                  </p>
                ) : null}
                {gitStatus?.error ? (
                  <p className="ws-settings-test-result ws-settings-test-result--error">{gitStatus.error}</p>
                ) : null}
                {gitActionError ? (
                  <p className="ws-settings-test-result ws-settings-test-result--error">{gitActionError}</p>
                ) : null}
                <div className="ws-settings-field">
                  <label className="ws-settings-label" htmlFor="git-sync-interval">Auto sync</label>
                  <select
                    id="git-sync-interval"
                    className="ws-settings-select"
                    value={gitStatus.syncIntervalMinutes}
                    onChange={(event) => void handleSyncIntervalChange(Number(event.target.value))}
                    disabled={gitBusy}
                  >
                    <option value={1}>Every minute</option>
                    <option value={5}>Every 5 minutes</option>
                    <option value={10}>Every 10 minutes</option>
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every hour</option>
                  </select>
                </div>
                <div className="ws-settings-ai-actions">
                  <button className="ws-settings-btn ws-settings-btn--primary" onClick={handleSyncNow} disabled={gitBusy}>
                    {gitBusy || gitStatus?.state === 'syncing' ? 'Syncing...' : 'Sync Now'}
                  </button>
                  <button className="ws-settings-btn" onClick={handleUnlinkRepository} disabled={gitBusy}>
                    Unlink
                  </button>
                </div>
              </div>
            )}
            {gitStatus?.state === 'error' && gitStatus.error && gitStatus.repositoryUrl === null ? (
              <p className="ws-settings-test-result ws-settings-test-result--error">{gitStatus.error}</p>
            ) : null}
          </div>

          <div className="ws-settings-section">
            <h3 className="ws-settings-section-title">AI Assistant</h3>
            <p className="ws-settings-description">
              Connect to a local model or cloud API to use the AI Chat feature.
            </p>

            {aiLoading ? (
              <p className="ws-settings-hint">Loading...</p>
            ) : (
              <div className="ws-settings-ai">
                <div className="ws-settings-field">
                  <label className="ws-settings-label">Provider</label>
                  <select
                    className="ws-settings-select"
                    value={aiConfig.provider}
                    onChange={(e) => handleProviderChange(e.target.value as ProviderType)}
                  >
                    {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                {aiConfig.provider !== 'gemini' && (
                  <div className="ws-settings-field">
                    <label className="ws-settings-label">Endpoint URL</label>
                    <input
                      className="ws-settings-input"
                      type="text"
                      value={aiConfig.endpoint}
                      onChange={(e) => setAiConfig({ ...aiConfig, endpoint: e.target.value })}
                      placeholder={PROVIDER_DEFAULTS[aiConfig.provider].endpoint}
                    />
                  </div>
                )}

                <div className="ws-settings-field">
                  <label className="ws-settings-label">Model</label>
                  <input
                    className="ws-settings-input"
                    type="text"
                    value={aiConfig.model}
                    onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                    placeholder={PROVIDER_DEFAULTS[aiConfig.provider].model}
                  />
                </div>

                {needsKey && (
                  <div className="ws-settings-field">
                    <label className="ws-settings-label">API Key</label>
                    <input
                      className="ws-settings-input"
                      type="password"
                      value={aiConfig.apiKey}
                      onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                      placeholder="Enter your API key"
                    />
                    <p className="ws-settings-hint">
                      Your key is encrypted at rest using OS-level secure storage.
                    </p>
                  </div>
                )}

                <div className="ws-settings-field">
                  <label className="ws-settings-label">Context limit (characters)</label>
                  <input
                    className="ws-settings-input"
                    type="number"
                    min="2000"
                    max="100000"
                    step="1000"
                    value={aiConfig.contextLimit || 12000}
                    onChange={(e) => setAiConfig({ ...aiConfig, contextLimit: parseInt(e.target.value) || 12000 })}
                  />
                  <p className="ws-settings-hint">
                    How much note content to include as context. Increase for cloud models with large context windows (e.g. 50000 for GPT-4o). Keep low (~8000–12000) for local models.
                  </p>
                </div>

                <div className="ws-settings-field">
                  <label className="ws-settings-label">Per-Note Character Limit</label>
                  <input
                    className="ws-settings-input"
                    type="number"
                    min="0"
                    max="50000"
                    step="100"
                    value={aiConfig.noteCharLimit ?? 800}
                    onChange={(e) => setAiConfig({ ...aiConfig, noteCharLimit: parseInt(e.target.value) || 0 })}
                  />
                  <p className="ws-settings-hint">
                    Max characters per note sent to the model. Set to 0 to send full notes without truncation. Default is 800. Increase if the AI is missing details from longer notes.
                  </p>
                </div>

                <div className="ws-settings-ai-actions">
                  <button
                    className="ws-settings-btn"
                    onClick={handleTestConnection}
                    disabled={testing}
                  >
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                  <button
                    className="ws-settings-btn ws-settings-btn--primary"
                    onClick={handleSaveAi}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>

                {testResult && (
                  <div className={`ws-settings-test-result ${testResult.ok ? 'ws-settings-test-result--ok' : 'ws-settings-test-result--error'}`}>
                    {testResult.ok ? '✓ Connected successfully!' : `✗ ${testResult.error || 'Connection failed'}`}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
