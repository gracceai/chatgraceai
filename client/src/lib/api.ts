export interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
}

export interface Message {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
}

type ChatEvent =
  | { type: 'meta'; conversationId: string }
  | { type: 'token'; content: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

const SESSION_KEY = 'graceai.sessionId';

function sessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function headers(extra: Record<string, string> = {}) {
  return { 'X-Session-Id': sessionId(), ...extra };
}

export async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch('/api/conversations', { headers: headers() });
  if (!res.ok) throw new Error('Could not load conversations');
  return res.json();
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, { headers: headers() });
  if (!res.ok) throw new Error('Could not load messages');
  return res.json();
}

export async function removeConversation(conversationId: string): Promise<void> {
  const res = await fetch(`/api/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok && res.status !== 404) throw new Error('Could not delete conversation');
}

export async function sendMessage(
  message: string,
  conversationId: string | null,
  handlers: {
    onConversation: (id: string) => void;
    onToken: (token: string) => void;
  },
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message, conversationId }),
    signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? 'Grace could not be reached. Please try again.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as ChatEvent;
    if (event.type === 'meta') handlers.onConversation(event.conversationId);
    else if (event.type === 'token') handlers.onToken(event.content);
    else if (event.type === 'error') throw new Error(event.message);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(handle);
  }
  handle(buffer + decoder.decode());
}
