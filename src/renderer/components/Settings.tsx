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
      window.api.ai.getConfig(),
    ]).then(([path, config]) => {
      setDataPath((path as string) ?? '~/Documents/NoteAndSave');
      setLoading(false);
      setAiConfig(config as AiConfig);
      setAiLoading(false);
    });
  }, []);

  const handleChangeLocation = async () => {
    const selected = await window.api.dialog.selectFolder();
    if (selected) {
      await window.api.settings.set('dataPath', selected);
      setDataPath(selected);
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
              <button className="ws-settings-btn" onClick={handleChangeLocation}>
                Change Location
              </button>
            </div>
            <p className="ws-settings-hint">
              Restart the app after changing the data location.
            </p>
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
