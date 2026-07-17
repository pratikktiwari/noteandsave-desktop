import { useState, useEffect, useCallback, useRef } from 'react';

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const streamingRef = useRef('');

  // Load conversations list
  const loadConversations = useCallback(async () => {
    try {
      const list = await window.api.ai.conversations.list();
      setConversations(list);
    } catch { /* ignore */ }
  }, []);

  // Load messages for a conversation
  const loadMessages = useCallback(async (convId: string) => {
    try {
      const msgs = await window.api.ai.messages.list(convId);
      setMessages(msgs.map((m: any) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        createdAt: m.created_at,
      })));
    } catch { /* ignore */ }
  }, []);

  // Select a conversation
  const selectConversation = useCallback(async (convId: string) => {
    setActiveConversationId(convId);
    await loadMessages(convId);
    setError(null);
  }, [loadMessages]);

  // Start a new conversation
  const newConversation = useCallback(async () => {
    setMessages([]);
    setActiveConversationId(null);
    setError(null);
    setStreamingContent('');
  }, []);

  // Delete a conversation
  const deleteConversation = useCallback(async (convId: string) => {
    await window.api.ai.conversations.delete(convId);
    if (activeConversationId === convId) {
      setMessages([]);
      setActiveConversationId(null);
    }
    await loadConversations();
  }, [activeConversationId, loadConversations]);

  // Subscribe to streaming events
  useEffect(() => {
    const unsubToken = window.api.ai.onToken((token) => {
      streamingRef.current += token;
      setStreamingContent(streamingRef.current);
    });

    const unsubDone = window.api.ai.onDone((fullText) => {
      setIsStreaming(false);
      const assistantMsg: ChatMsg = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: fullText,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingContent('');
      streamingRef.current = '';

      // Save to DB
      if (activeConversationId) {
        window.api.ai.messages.save({
          conversationId: activeConversationId,
          id: assistantMsg.id,
          role: 'assistant',
          content: fullText,
        });
      }
    });

    const unsubError = window.api.ai.onError((err) => {
      setIsStreaming(false);
      setStreamingContent('');
      streamingRef.current = '';
      setError(err);
    });

    return () => {
      unsubToken();
      unsubDone();
      unsubError();
    };
  }, [activeConversationId]);

  // Detect time range from user message
  function detectTimeRange(text: string): 'week' | 'month' | 'year' | 'all' {
    const lower = text.toLowerCase();
    if (lower.includes('this week') || lower.includes('past week') || lower.includes('last week') || lower.includes('last 7')) return 'week';
    if (lower.includes('this month') || lower.includes('past month') || lower.includes('last month') || lower.includes('last 30')) return 'month';
    if (lower.includes('this year') || lower.includes('past year') || lower.includes('last year')) return 'year';
    return 'all';
  }

  // Send a message
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    setError(null);

    // Create conversation if needed
    let convId = activeConversationId;
    if (!convId) {
      const conv = await window.api.ai.conversations.create(text.slice(0, 60));
      convId = conv.id;
      setActiveConversationId(convId);
      await loadConversations();
    }

    // Add user message
    const userMsg: ChatMsg = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Save user message
    await window.api.ai.messages.save({
      conversationId: convId,
      id: userMsg.id,
      role: 'user',
      content: text,
    });

    // Start streaming
    setIsStreaming(true);
    streamingRef.current = '';
    setStreamingContent('');

    const allMessages = [...messages, userMsg].map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const timeRange = detectTimeRange(text);

    window.api.ai.chat({
      messages: allMessages,
      conversationId: convId,
      includeNotes: true,
      timeRange,
    });
  }, [isStreaming, activeConversationId, messages, loadConversations]);

  // Abort streaming
  const abort = useCallback(() => {
    window.api.ai.abort();
    setIsStreaming(false);
    if (streamingRef.current) {
      const assistantMsg: ChatMsg = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: streamingRef.current + '\n\n*(response interrupted)*',
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    }
    setStreamingContent('');
    streamingRef.current = '';
  }, []);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  return {
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
    loadConversations,
  };
}
