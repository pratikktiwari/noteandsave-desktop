/**
 * AI chat IPC handler.
 *
 * Bridges the renderer with AI providers. Handles:
 * - Streaming chat via IPC events
 * - Config persistence (encrypted API keys)
 * - Notes context injection
 * - Chat history storage
 */

import { BrowserWindow, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  getProvider,
  encryptApiKey,
  decryptApiKey,
  defaultConfigs,
  type AiConfig,
  type ChatMessage,
  type ProviderType,
} from './ai-providers';
import { getSetting, setSetting, getDb } from './database';

// ---------------------------------------------------------------------------
// Chat history table
// ---------------------------------------------------------------------------

export function ensureChatTables(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages (conversation_id, created_at);
  `);
}

// ---------------------------------------------------------------------------
// Context builder — extract plain text from TipTap JSON
// ---------------------------------------------------------------------------

function tiptapToPlainText(json: any): string {
  if (!json) return '';
  if (typeof json === 'string') return json;

  let text = '';

  if (json.type === 'text') {
    return json.text || '';
  }

  if (Array.isArray(json.content)) {
    for (const node of json.content) {
      const nodeText = tiptapToPlainText(node);
      if (nodeText) {
        // Add newline between block-level nodes
        if (json.type === 'doc' || json.type === 'bulletList' || json.type === 'orderedList' || json.type === 'blockquote') {
          text += nodeText + '\n';
        } else {
          text += nodeText;
        }
      }
    }
  }

  // Add formatting hints for certain node types
  if (json.type === 'heading') {
    const level = json.attrs?.level || 1;
    text = '#'.repeat(level) + ' ' + text;
  } else if (json.type === 'listItem') {
    text = '- ' + text;
  } else if (json.type === 'taskItem') {
    const checked = json.attrs?.checked ? 'x' : ' ';
    text = `[${checked}] ` + text;
  } else if (json.type === 'codeBlock') {
    text = '```\n' + text + '\n```';
  } else if (json.type === 'paragraph') {
    text += '\n';
  }

  return text;
}

function buildNotesContext(notes: Array<{ title: string; content: any; updatedAt: number; tags: string[] }>, maxChars = 12000): string {
  const MAX_NOTE_CHARS = 800; // truncate each note to avoid one huge note eating all context
  let context = '';
  for (const note of notes) {
    const date = new Date(note.updatedAt).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    const tags = note.tags.length ? ` [tags: ${note.tags.join(', ')}]` : '';
    let body = tiptapToPlainText(typeof note.content === 'string' ? JSON.parse(note.content) : note.content).trim();
    if (body.length > MAX_NOTE_CHARS) {
      body = body.slice(0, MAX_NOTE_CHARS) + '...';
    }
    const entry = `--- ${note.title} (${date})${tags} ---\n${body}\n\n`;

    if (context.length + entry.length > maxChars) break;
    context += entry;
  }
  return context;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a helpful assistant integrated into "Note & Save", a personal note-taking and task-tracking desktop app. The user's notes are provided below as context.

Your capabilities:
- Summarize notes over a time period (this week, this month, this year)
- Generate status update emails from notes
- Answer questions about the user's notes and tasks
- Identify patterns, themes, and frequently used tags
- Help organize and prioritize work based on notes

When generating summaries or status updates:
- Use clear, professional language
- Organize by categories/tags when relevant
- Include dates and key accomplishments
- Format as markdown for readability

When the user asks for an email summary, format it as a ready-to-send email with subject line, greeting, bullet-point accomplishments, and closing.`;

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

let abortCurrent: (() => void) | null = null;

export function registerAiHandlers(): void {
  // Get AI config
  ipcMain.handle('ai:getConfig', async () => {
    const raw = await getSetting('ai_config');
    if (!raw) {
      return { ...defaultConfigs.ollama, apiKey: '' };
    }
    const config = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // Decrypt the key for the renderer
    return { ...config, apiKey: config.apiKey ? decryptApiKey(config.apiKey) : '' };
  });

  // Save AI config
  ipcMain.handle('ai:setConfig', async (_e, config: AiConfig) => {
    const toStore = {
      ...config,
      apiKey: config.apiKey ? encryptApiKey(config.apiKey) : '',
    };
    await setSetting('ai_config', JSON.stringify(toStore));
    return true;
  });

  // Test connection
  ipcMain.handle('ai:testConnection', async (_e, config: AiConfig) => {
    const provider = getProvider(config.provider);
    return provider.testConnection(config);
  });

  // Streaming chat
  ipcMain.on('ai:chat', async (event, payload: {
    messages: ChatMessage[];
    conversationId?: string;
    includeNotes?: boolean;
    timeRange?: 'week' | 'month' | 'year' | 'all';
  }) => {
    // Abort any running request
    if (abortCurrent) {
      abortCurrent();
      abortCurrent = null;
    }

    try {
      // Get config
      const rawConfig = await getSetting('ai_config');
      if (!rawConfig) {
        event.reply('ai:chat:error', 'AI is not configured. Please set up a provider in Settings.');
        return;
      }
      const config: AiConfig = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig;
      config.apiKey = config.apiKey ? decryptApiKey(config.apiKey) : '';

      const provider = getProvider(config.provider);

      // Build messages with context
      const messages: ChatMessage[] = [];

      // System prompt with notes context
      if (payload.includeNotes !== false) {
        const db = getDb();
        let query = 'SELECT title, content, updated_at, tags FROM notes WHERE deleted = 0';
        const params: any[] = [];

        if (payload.timeRange && payload.timeRange !== 'all') {
          const now = Date.now();
          const ranges: Record<string, number> = {
            week: 7 * 24 * 60 * 60 * 1000,
            month: 30 * 24 * 60 * 60 * 1000,
            year: 365 * 24 * 60 * 60 * 1000,
          };
          query += ' AND updated_at > ?';
          params.push(now - (ranges[payload.timeRange] || ranges.week));
        }

        query += ' ORDER BY updated_at DESC LIMIT 30';

        const stmt = db.prepare(query);
        if (params.length) stmt.bind(params);

        const notes: Array<{ title: string; content: any; updatedAt: number; tags: string[] }> = [];
        while (stmt.step()) {
          const row = stmt.getAsObject() as any;
          notes.push({
            title: row.title,
            content: row.content,
            updatedAt: row.updated_at,
            tags: JSON.parse(row.tags || '[]'),
          });
        }
        stmt.free();

        const contextLimit = (config as any).contextLimit || 12000;
        const context = buildNotesContext(notes, contextLimit);
        messages.push({
          role: 'system',
          content: SYSTEM_PROMPT + (context ? `\n\n--- USER'S NOTES ---\n${context}` : '\n\n(The user has no notes yet.)'),
        });
      } else {
        messages.push({ role: 'system', content: SYSTEM_PROMPT });
      }

      // Add conversation messages
      messages.push(...payload.messages);

      // Stream
      abortCurrent = provider.chat(messages, config, {
        onToken(token) {
          if (!event.sender.isDestroyed()) {
            event.reply('ai:chat:token', token);
          }
        },
        onDone(fullText) {
          abortCurrent = null;
          if (!event.sender.isDestroyed()) {
            event.reply('ai:chat:done', fullText);
          }
        },
        onError(error) {
          abortCurrent = null;
          if (!event.sender.isDestroyed()) {
            event.reply('ai:chat:error', error);
          }
        },
      });
    } catch (err: any) {
      event.reply('ai:chat:error', err.message || 'Unknown error');
    }
  });

  // Abort current request
  ipcMain.on('ai:abort', () => {
    if (abortCurrent) {
      abortCurrent();
      abortCurrent = null;
    }
  });

  // --- Chat history ---

  ipcMain.handle('ai:conversations:list', async () => {
    ensureChatTables();
    const db = getDb();
    const stmt = db.prepare('SELECT id, title, created_at, updated_at FROM chat_conversations ORDER BY updated_at DESC LIMIT 50');
    const rows: any[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  });

  ipcMain.handle('ai:conversations:create', async (_e, title?: string) => {
    ensureChatTables();
    const db = getDb();
    const id = randomUUID();
    const now = Date.now();
    db.run('INSERT INTO chat_conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)', [id, title || 'New Chat', now, now]);
    return { id, title: title || 'New Chat', created_at: now, updated_at: now };
  });

  ipcMain.handle('ai:conversations:delete', async (_e, id: string) => {
    ensureChatTables();
    const db = getDb();
    db.run('DELETE FROM chat_messages WHERE conversation_id = ?', [id]);
    db.run('DELETE FROM chat_conversations WHERE id = ?', [id]);
    return true;
  });

  ipcMain.handle('ai:messages:list', async (_e, conversationId: string) => {
    ensureChatTables();
    const db = getDb();
    const stmt = db.prepare('SELECT id, role, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC');
    stmt.bind([conversationId]);
    const rows: any[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  });

  ipcMain.handle('ai:messages:save', async (_e, msg: { conversationId: string; id: string; role: string; content: string }) => {
    ensureChatTables();
    const db = getDb();
    const now = Date.now();
    db.run('INSERT OR REPLACE INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      [msg.id, msg.conversationId, msg.role, msg.content, now]);
    db.run('UPDATE chat_conversations SET updated_at = ? WHERE id = ?', [now, msg.conversationId]);
    return true;
  });
}
