import { useCallback, useEffect, useRef, useState } from 'react';
import ChatMessage from './components/ChatMessage';
import Composer from './components/Composer';
import Sidebar from './components/Sidebar';
import {
  fetchConversations,
  fetchMessages,
  removeConversation,
  sendMessage,
  type Conversation,
  type Message,
} from './lib/api';

const SUGGESTIONS = [
  "I've been feeling anxious lately",
  "I can't seem to sleep well",
  'Work stress is overwhelming me',
  'I just need someone to talk to',
];

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshConversations = useCallback(() => {
    fetchConversations()
      .then(setConversations)
      .catch(() => {});
  }, []);

  useEffect(refreshConversations, [refreshConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const startNewChat = () => {
    abortRef.current?.abort();
    setActiveId(null);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
  };

  const openConversation = async (id: string) => {
    if (id === activeId) return;
    abortRef.current?.abort();
    setActiveId(id);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
    try {
      setMessages(await fetchMessages(id));
    } catch {
      setError('Could not load this conversation.');
    }
  };

  const deleteConversation = async (id: string) => {
    await removeConversation(id).catch(() => {});
    if (id === activeId) startNewChat();
    refreshConversations();
  };

  const send = async (text: string) => {
    if (streaming) return;
    setError(null);
    setStreaming(true);

    const pendingId = `pending-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: text },
      { id: pendingId, role: 'assistant', content: '' },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await sendMessage(
        text,
        activeId,
        {
          onConversation: (id) => setActiveId(id),
          onToken: (token) =>
            setMessages((prev) =>
              prev.map((m) => (m.id === pendingId ? { ...m, content: m.content + token } : m)),
            ),
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setMessages((prev) => prev.filter((m) => m.id !== pendingId || m.content));
      setStreaming(false);
      abortRef.current = null;
      refreshConversations();
    }
  };

  const stop = () => abortRef.current?.abort();

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={startNewChat}
        onSelect={openConversation}
        onDelete={deleteConversation}
      />

      <main className="flex min-w-0 flex-1 flex-col bg-surface-low">
        <header className="flex items-center gap-3 border-b border-outline/50 bg-white/80 px-4 py-3 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-ink-soft hover:bg-surface-mid md:hidden"
            aria-label="Open conversations"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-display text-lg font-bold text-mint">
            G
          </div>
          <div>
            <h1 className="font-display text-base font-semibold text-ink">Grace Companion</h1>
            <p className="flex items-center gap-1.5 text-xs text-mint-strong">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Online
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 md:px-6">
            {isEmpty ? (
              <div className="flex flex-col items-center pt-10 text-center md:pt-20">
                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary font-display text-3xl font-bold text-mint shadow-lg shadow-primary/20">
                  G
                </div>
                <h2 className="font-display text-2xl font-bold text-primary-strong md:text-3xl">
                  Hello, I&apos;m Grace.
                </h2>
                <p className="mt-3 max-w-md text-ink-soft">
                  I&apos;m here to listen, without judgment, whenever you need. How are you
                  feeling today?
                </p>
                <div className="mt-8 grid w-full max-w-lg gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => send(suggestion)}
                      className="rounded-xl border border-outline/60 bg-white px-4 py-3 text-left text-sm text-ink transition hover:border-primary-tint hover:bg-primary-soft/40"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  typing={streaming && message.role === 'assistant' && !message.content}
                />
              ))
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <Composer streaming={streaming} onSend={send} onStop={stop} />
      </main>
    </div>
  );
}
