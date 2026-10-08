import { useCallback, useEffect, useRef, useState } from 'react';
import Avatar, { isAvatarVariant, type AvatarVariant } from './components/Avatar';
import ChatMessage from './components/ChatMessage';
import Composer from './components/Composer';
import HelpDialog from './components/HelpDialog';
import Sidebar from './components/Sidebar';
import {
  fetchConversations,
  fetchMessages,
  fetchSiteConfig,
  removeConversation,
  sendMessage,
  type Conversation,
  type Message,
  type Suggestion,
} from './lib/api';
import {
  playReply,
  playSend,
  setRecordedSources,
  setSoundEnabled,
  soundEnabled,
  startThinking,
  stopThinking,
} from './lib/sound';

const AVATAR_KEY = 'graceai.avatar';

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [avatar, setAvatar] = useState<AvatarVariant>(() => {
    const stored = localStorage.getItem(AVATAR_KEY);
    return isAvatarVariant(stored) ? stored : 'pebble';
  });
  const [soundOn, setSoundOn] = useState(soundEnabled);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshConversations = useCallback(() => {
    fetchConversations()
      .then(setConversations)
      .catch(() => {});
  }, []);

  useEffect(refreshConversations, [refreshConversations]);

  useEffect(() => {
    fetchSiteConfig()
      .then((siteConfig) => {
        setSuggestions(siteConfig.suggestions);
        setRecordedSources(siteConfig.sounds);
        if (localStorage.getItem(AVATAR_KEY) === null && isAvatarVariant(siteConfig.defaultCompanion)) {
          setAvatar(siteConfig.defaultCompanion);
        }
      })
      .catch(() => {});
  }, []);

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
    playSend(avatar);
    startThinking(avatar);
    let firstToken = true;

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
          onToken: (token) => {
            if (firstToken) {
              firstToken = false;
              stopThinking();
              playReply(avatar);
            }
            setMessages((prev) =>
              prev.map((m) => (m.id === pendingId ? { ...m, content: m.content + token } : m)),
            );
          },
        },
        controller.signal,
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      stopThinking();
      setMessages((prev) => prev.filter((m) => m.id !== pendingId || m.content));
      setStreaming(false);
      abortRef.current = null;
      refreshConversations();
    }
  };

  const stop = () => abortRef.current?.abort();

  const toggleSound = () => {
    setSoundEnabled(!soundOn, avatar);
    setSoundOn(!soundOn);
  };

  const chooseAvatar =(next: AvatarVariant) => {
    localStorage.setItem(AVATAR_KEY, next);
    setAvatar(next);
    playReply(next);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-surface-low">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        avatar={avatar}
        onAvatarChange={chooseAvatar}
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
          <div className="flex w-10 shrink-0 justify-center">
            <Avatar variant={avatar} size="sm" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[15px] font-bold tracking-[-0.01em] text-ink sm:text-base">Grace Companion</h1>
            <p className="flex items-center gap-1.5 text-xs text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-sage" />
              Online
            </p>
          </div>
          <HelpDialog avatar={avatar} />
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft transition hover:bg-primary-soft/60 hover:text-primary"
            aria-label={soundOn ? 'Turn sound off' : 'Turn sound on'}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H3v6h3l5 4z" />
              {soundOn ? <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /> : <path d="m16 9 5 6M21 9l-5 6" />}
            </svg>
          </button>
        </header>

        <div className="grace-scrollbar min-h-0 flex-1 overscroll-contain overflow-y-auto">
          <div className={`mx-auto flex min-h-full max-w-3xl flex-col px-4 md:px-6 ${isEmpty ? 'justify-center py-8' : 'gap-5 py-7 md:py-10'}`}>
            {isEmpty ? (
              <div className="flex w-full flex-col items-center text-center">
                <div className="mb-6">
                  <Avatar variant={avatar} size="lg" />
                </div>
                <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-primary-strong md:text-4xl">
                  Hello, I&apos;m Grace.
                </h2>
                <p className="mt-3 max-w-lg text-[15px] leading-7 text-ink-soft md:text-base">
                  I&apos;m here to listen, without judgment, whenever you need. How are you
                  feeling today?
                </p>
                <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                  {suggestions.map((suggestion) => (
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
                  avatar={avatar}
                  typing={streaming && message.role === 'assistant' && !message.content}
                />
              ))
            )}

            {error && (
              <div
                role="alert"
                className="rounded-2xl border border-clay/40 bg-clay-soft px-4 py-3 text-sm text-clay-ink"
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
