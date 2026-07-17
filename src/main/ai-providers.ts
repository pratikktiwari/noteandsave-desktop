/**
 * AI Provider abstraction layer.
 *
 * Each provider implements the same streaming chat interface so the renderer
 * is completely backend-agnostic. Supported backends:
 *   - Ollama         (local, http://localhost:11434)
 *   - LM Studio      (local, OpenAI-compatible at http://localhost:1234)
 *   - OpenAI         (cloud, api.openai.com)
 *   - Google Gemini   (cloud, generativelanguage.googleapis.com)
 */

import { safeStorage } from 'electron';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderType = 'ollama' | 'lmstudio' | 'openai' | 'gemini';

export interface AiConfig {
  provider: ProviderType;
  endpoint: string;       // base URL
  apiKey: string;         // encrypted at rest, decrypted in memory
  model: string;          // model name / id
  contextLimit?: number;  // max chars of notes context to include
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

export interface AiProvider {
  name: ProviderType;
  /** Stream a chat completion. Returns an abort function. */
  chat(messages: ChatMessage[], config: AiConfig, callbacks: StreamCallbacks): () => void;
  /** Test connectivity / auth. */
  testConnection(config: AiConfig): Promise<{ ok: boolean; error?: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  urlStr: string,
  method: string,
  headers: Record<string, string>,
  body: string,
  onData: (chunk: string) => void,
  onEnd: () => void,
  onError: (err: Error) => void,
): { abort: () => void } {
  const url = new URL(urlStr);
  const mod = url.protocol === 'https:' ? https : http;

  const req = mod.request(url, { method, headers }, (res) => {
    res.setEncoding('utf8');
    res.on('data', onData);
    res.on('end', onEnd);
    res.on('error', onError);
  });

  req.on('error', onError);
  req.write(body);
  req.end();

  return { abort: () => req.destroy() };
}

// ---------------------------------------------------------------------------
// Ollama (native API)
// ---------------------------------------------------------------------------

const ollamaProvider: AiProvider = {
  name: 'ollama',

  chat(messages, config, { onToken, onDone, onError }) {
    const endpoint = (config.endpoint || 'http://localhost:11434').replace(/\/+$/, '');
    const url = `${endpoint}/api/chat`;

    const payload = JSON.stringify({
      model: config.model || 'llama3',
      messages,
      stream: true,
    });

    let fullText = '';

    const { abort } = makeRequest(
      url, 'POST',
      { 'Content-Type': 'application/json' },
      payload,
      (chunk) => {
        for (const line of chunk.split('\n').filter(Boolean)) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              fullText += data.message.content;
              onToken(data.message.content);
            }
          } catch { /* partial JSON, ignore */ }
        }
      },
      () => onDone(fullText),
      (err) => onError(err.message),
    );

    return abort;
  },

  async testConnection(config) {
    const endpoint = (config.endpoint || 'http://localhost:11434').replace(/\/+$/, '');
    try {
      const url = new URL(`${endpoint}/api/tags`);
      const mod = url.protocol === 'https:' ? https : http;
      return new Promise((resolve) => {
        const req = mod.get(url, (res) => {
          let body = '';
          res.on('data', (d) => { body += d; });
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve({ ok: true });
            } else {
              resolve({ ok: false, error: `HTTP ${res.statusCode}` });
            }
          });
        });
        req.on('error', (e) => resolve({ ok: false, error: e.message }));
        req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'Connection timed out' }); });
      });
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  },
};

// ---------------------------------------------------------------------------
// LM Studio (OpenAI-compatible)
// ---------------------------------------------------------------------------

function openAiCompatibleChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
): () => void {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const payload = JSON.stringify({ model, messages, stream: true });
  let fullText = '';

  const { abort } = makeRequest(
    url, 'POST', headers, payload,
    (chunk) => {
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const jsonStr = trimmed.slice(6);
        if (jsonStr === '[DONE]') return;
        try {
          const parsed = JSON.parse(jsonStr);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            fullText += token;
            callbacks.onToken(token);
          }
        } catch { /* partial */ }
      }
    },
    () => callbacks.onDone(fullText),
    (err) => callbacks.onError(err.message),
  );

  return abort;
}

async function openAiCompatibleTest(
  baseUrl: string,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/models`;
  try {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    return new Promise((resolve) => {
      const headers: Record<string, string> = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const req = mod.get(parsed, { headers }, (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => {
          if (res.statusCode === 200) resolve({ ok: true });
          else resolve({ ok: false, error: `HTTP ${res.statusCode}: ${body.slice(0, 200)}` });
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'Connection timed out' }); });
    });
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

const lmStudioProvider: AiProvider = {
  name: 'lmstudio',
  chat(messages, config, callbacks) {
    const endpoint = config.endpoint || 'http://localhost:1234';
    return openAiCompatibleChat(endpoint, '', config.model || 'default', messages, callbacks);
  },
  async testConnection(config) {
    const endpoint = config.endpoint || 'http://localhost:1234';
    return openAiCompatibleTest(endpoint, '');
  },
};

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

const openaiProvider: AiProvider = {
  name: 'openai',
  chat(messages, config, callbacks) {
    return openAiCompatibleChat(
      config.endpoint || 'https://api.openai.com',
      config.apiKey,
      config.model || 'gpt-4o-mini',
      messages,
      callbacks,
    );
  },
  async testConnection(config) {
    return openAiCompatibleTest(config.endpoint || 'https://api.openai.com', config.apiKey);
  },
};

// ---------------------------------------------------------------------------
// Gemini (Google AI Studio)
// ---------------------------------------------------------------------------

const geminiProvider: AiProvider = {
  name: 'gemini',

  chat(messages, config, { onToken, onDone, onError }) {
    const model = config.model || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;

    // Convert OpenAI-style messages to Gemini format
    const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const payload: any = { contents };
    if (systemParts.length) {
      payload.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] };
    }

    let fullText = '';

    const { abort } = makeRequest(
      url, 'POST',
      { 'Content-Type': 'application/json' },
      JSON.stringify(payload),
      (chunk) => {
        for (const line of chunk.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              fullText += text;
              onToken(text);
            }
          } catch { /* partial */ }
        }
      },
      () => onDone(fullText),
      (err) => onError(err.message),
    );

    return abort;
  },

  async testConnection(config) {
    const model = config.model || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${config.apiKey}`;
    try {
      return new Promise((resolve) => {
        const req = https.get(url, (res) => {
          let body = '';
          res.on('data', (d) => { body += d; });
          res.on('end', () => {
            if (res.statusCode === 200) resolve({ ok: true });
            else resolve({ ok: false, error: `HTTP ${res.statusCode}: ${body.slice(0, 200)}` });
          });
        });
        req.on('error', (e) => resolve({ ok: false, error: e.message }));
        req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: 'Connection timed out' }); });
      });
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const providers: Record<ProviderType, AiProvider> = {
  ollama: ollamaProvider,
  lmstudio: lmStudioProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
};

export function getProvider(type: ProviderType): AiProvider {
  return providers[type];
}

// ---------------------------------------------------------------------------
// Safe key storage helpers
// ---------------------------------------------------------------------------

export function encryptApiKey(plain: string): string {
  if (!plain) return '';
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plain).toString('base64');
  }
  // Fallback: base64 only (not truly secure, but better than plaintext)
  return Buffer.from(plain).toString('base64');
}

export function decryptApiKey(encrypted: string): string {
  if (!encrypted) return '';
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }
  return Buffer.from(encrypted, 'base64').toString();
}

// ---------------------------------------------------------------------------
// Default configs
// ---------------------------------------------------------------------------

export const defaultConfigs: Record<ProviderType, Omit<AiConfig, 'apiKey'>> = {
  ollama: { provider: 'ollama', endpoint: 'http://localhost:11434', model: 'llama3' },
  lmstudio: { provider: 'lmstudio', endpoint: 'http://localhost:1234', model: 'default' },
  openai: { provider: 'openai', endpoint: 'https://api.openai.com', model: 'gpt-4o-mini' },
  gemini: { provider: 'gemini', endpoint: '', model: 'gemini-2.0-flash' },
};
