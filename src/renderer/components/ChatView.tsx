import React, { useState, useRef, useEffect } from 'react';
import { useChat, type ChatMsg } from '../hooks/useChat';
import { Settings } from './Settings';

// Suggestion chips shown on empty chat
const SUGGESTIONS = [
  { label: '📋 Summarize my week', prompt: 'Give me a summary of what I worked on this week' },
  { label: '📊 Monthly status update', prompt: 'Generate a monthly status update email from my notes this month' },
  { label: '🏷️ Active topics', prompt: 'What are my most active tags and topics across all notes?' },
  { label: '✅ Recent tasks', prompt: 'List all tasks and checklists I completed recently' },
  { label: '📧 Weekly email draft', prompt: 'Draft a weekly status update email summarizing my work this week, formatted professionally with bullet points' },
  { label: '🔍 Note insights', prompt: 'Analyze my notes and give me insights about my work patterns and focus areas' },
];

function SimpleMarkdown({ content }: { content: string }) {
  // Minimal markdown rendering for chat messages
  const html = content
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold (allow multiline with [\s\S])
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    // Clean up orphaned ** markers that have no closing pair
    .replace(/\*\*/g, '')
    // Italic
    .replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '<em>$1</em>')
    // Headers
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Unordered lists
    .replace(/^[•\-] (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr/>')
    // Line breaks (double newline = paragraph, single = br)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  return (
    <div
      className="ws-chat__markdown"
      dangerouslySetInnerHTML={{ __html: `<p>${html}</p>` }}
    />
  );
}

function ChatMessageBubble({ msg, isStreaming }: { msg: ChatMsg | { role: 'assistant'; content: string }; isStreaming?: boolean }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`ws-chat__message ${isUser ? 'ws-chat__message--user' : 'ws-chat__message--assistant'}`}>
      {!isUser && (
        <div className="ws-chat__avatar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2C6.48 2 2 6.02 2 10.87c0 2.82 1.5 5.33 3.85 6.98L4 22l4.59-2.56c1.08.35 2.22.56 3.41.56 5.52 0 10-4.02 10-8.87S17.52 2 12 2z" />
          </svg>
        </div>
      )}
      <div className="ws-chat__bubble">
        {isUser ? (
          <span>{msg.content}</span>
        ) : (
          <SimpleMarkdown content={msg.content} />
        )}
        {isStreaming && <span className="ws-chat__cursor">▊</span>}
      </div>
      {!isUser && !isStreaming && msg.content && (
        <button
          className="ws-chat__copy-btn"
          onClick={() => navigator.clipboard.writeText(msg.content)}
          title="Copy to clipboard"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function ChatView() {
  const {
    messages,
    conversations,
    activeConversationId,
    isStreaming,
    streamingContent,
    error,
    sendMessage,
    abort,
    selectConversation,
    newConversation,
    deleteConversation,
  } = useChat();

  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected' | 'not_configured'>('checking');
  const settingsClosedCount = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Check connection on mount
  useEffect(() => {
    checkConnection(true);
  }, []);

  // Re-check silently when settings closes
  useEffect(() => {
    if (!showSettings) {
      // Skip the initial render (mount already handled above)
      if (settingsClosedCount.current > 0) {
        checkConnection(false);
      }
      settingsClosedCount.current++;
    }
  }, [showSettings]);

  function checkConnection(showLoading: boolean) {
    if (showLoading) setConnectionStatus('checking');
    window.api.ai.getConfig().then(async (config: any) => {
      const hasKey = config.provider === 'ollama' || config.provider === 'lmstudio' || !!config.apiKey;
      if (!hasKey) {
        setConnectionStatus('not_configured');
        return;
      }
      try {
        const result = await window.api.ai.testConnection(config);
        setConnectionStatus(result.ok ? 'connected' : 'disconnected');
      } catch {
        setConnectionStatus('disconnected');
      }
    });
  }

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (prompt: string) => {
    sendMessage(prompt);
  };

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="ws-chat">
      {/* Header */}
      <div className="ws-chat__header">
        <div className="ws-chat__header-left">
          <h2 className="ws-chat__title">AI Chat</h2>
          <span className="ws-chat__subtitle">Ask about your notes</span>
        </div>
        <div className="ws-chat__header-actions">
          <button
            className="ws-chat__header-btn"
            onClick={() => setShowHistory(!showHistory)}
            title="Chat history"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
          <button
            className="ws-chat__header-btn"
            onClick={newConversation}
            title="New chat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      <div className="ws-chat__body">
        {/* History sidebar */}
        {showHistory && (
          <div className="ws-chat__history">
            <div className="ws-chat__history-header">
              <span>History</span>
              <button onClick={() => setShowHistory(false)} className="ws-chat__history-close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="ws-chat__history-list">
              {conversations.length === 0 ? (
                <div className="ws-chat__history-empty">No conversations yet</div>
              ) : conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`ws-chat__history-item ${conv.id === activeConversationId ? 'ws-chat__history-item--active' : ''}`}
                >
                  <button
                    className="ws-chat__history-item-btn"
                    onClick={() => { selectConversation(conv.id); setShowHistory(false); }}
                  >
                    {conv.title}
                  </button>
                  <button
                    className="ws-chat__history-delete"
                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                    title="Delete conversation"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages area */}
        <div className="ws-chat__messages">
          {isEmpty ? (
            <div className="ws-chat__empty">
              <div className="ws-chat__empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2C6.48 2 2 6.02 2 10.87c0 2.82 1.5 5.33 3.85 6.98L4 22l4.59-2.56c1.08.35 2.22.56 3.41.56 5.52 0 10-4.02 10-8.87S17.52 2 12 2z" />
                  <path d="M8 10h.01M12 10h.01M16 10h.01" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <h3>Chat with your notes</h3>
              <p>Ask questions about your notes, get summaries, or generate reports.</p>

              {(connectionStatus === 'not_configured' || connectionStatus === 'disconnected') && (
                <button
                  className="ws-chat__configure-btn"
                  onClick={() => setShowSettings(true)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {connectionStatus === 'disconnected' ? (
                      <>
                        <line x1="1" y1="1" x2="23" y2="23" />
                        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
                      </>
                    ) : (
                      <>
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-1.42 3.42 2 2 0 0 1-1.41-.59l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-3.42-1.42 2 2 0 0 1 .59-1.41l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </>
                    )}
                  </svg>
                  {connectionStatus === 'disconnected'
                    ? 'Connection failed — check settings'
                    : 'Connect a model to get started'}
                </button>
              )}

              {connectionStatus === 'checking' && (
                <div className="ws-chat__connection-status">Checking connection...</div>
              )}

              <div className="ws-chat__suggestions">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    className="ws-chat__suggestion"
                    onClick={() => handleSuggestionClick(s.prompt)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <ChatMessageBubble key={msg.id} msg={msg} />
              ))}
              {isStreaming && streamingContent && (
                <ChatMessageBubble
                  msg={{ role: 'assistant', content: streamingContent }}
                  isStreaming
                />
              )}
              {isStreaming && !streamingContent && (
                <div className="ws-chat__message ws-chat__message--assistant">
                  <div className="ws-chat__avatar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2C6.48 2 2 6.02 2 10.87c0 2.82 1.5 5.33 3.85 6.98L4 22l4.59-2.56c1.08.35 2.22.56 3.41.56 5.52 0 10-4.02 10-8.87S17.52 2 12 2z" />
                    </svg>
                  </div>
                  <div className="ws-chat__bubble ws-chat__bubble--thinking">
                    <span className="ws-chat__dot" />
                    <span className="ws-chat__dot" />
                    <span className="ws-chat__dot" />
                  </div>
                </div>
              )}
              {error && (
                <div className="ws-chat__error">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="ws-chat__input-area">
        <div className="ws-chat__input-wrapper">
          <textarea
            ref={inputRef}
            className="ws-chat__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your notes..."
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button className="ws-chat__send-btn ws-chat__send-btn--abort" onClick={abort} title="Stop generating">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              className="ws-chat__send-btn"
              onClick={handleSend}
              disabled={!input.trim()}
              title="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
        <div className="ws-chat__input-hint">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
