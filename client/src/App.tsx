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
  { label: 'Ease anxious thoughts', message: "I've been feeling anxious lately" },
  { label: 'Improve my sleep', message: "I can't seem to sleep well" },
  { label: 'Manage work stress', message: 'Work stress is overwhelming me' },
  { label: 'Talk things through', message: 'I just need someone to talk to' },
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
    bottomRef.current?.scrollIntoView({ behavior: streaming ? 'auto' : 'smooth', block: 'end' });
  }, [messages, streaming]);

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
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-surface-low">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={startNewChat}
        onSelect={openConversation}
        onDelete={deleteConversation}
      />

      <main className="app-shell flex min-w-0 flex-1 flex-col">
        <header className="z-10 flex h-[72px] shrink-0 items-center gap-3 border-b border-outline/35 bg-white px-4 md:px-7">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft transition hover:bg-primary-soft/60 hover:text-primary md:hidden"
            aria-label="Open conversations"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-base font-bold text-mint">
            G
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[15px] font-bold tracking-[-0.01em] text-ink sm:text-base">Grace Companion</h1>
            <p className="flex items-center gap-1.5 text-xs text-mint-strong">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Online
            </p>
          </div>
        </header>

        <div className="grace-scrollbar min-h-0 flex-1 overscroll-contain overflow-y-auto">
          <div className={`mx-auto flex min-h-full max-w-3xl flex-col px-4 md:px-6 ${isEmpty ? 'justify-center py-8' : 'gap-5 py-7 md:py-10'}`}>
            {isEmpty ? (
              <div className="flex w-full flex-col items-center text-center">
                <div className="mb-6">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary font-display text-2xl font-bold text-mint">
                    G
                  </div>
                </div>
                <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-primary-strong md:text-4xl">
                  Hello, I&apos;m Grace.
                </h2>
                <p className="mt-3 max-w-lg text-[15px] leading-7 text-ink-soft md:text-base">
                  I&apos;m here to listen, without judgment, whenever you need. How are you
                  feeling today?
                </p>
                <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion.message}
                      type="button"
                      onClick={() => send(suggestion.message)}
                      className="group flex min-h-14 items-center justify-between gap-3 rounded-xl border border-outline/50 bg-white px-4 py-3 text-left text-sm text-ink transition hover:border-primary-tint"
                    >
                      <span className="font-medium text-primary-strong">{suggestion.label}</span>
                      <span className="text-ink-soft/50 transition group-hover:translate-x-0.5 group-hover:text-primary">→</span>
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
                className="rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-800 shadow-sm"
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
