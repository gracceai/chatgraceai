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

export interface Suggestion {
  label: string;
  message: string;
}

export interface SiteConfig {
  defaultCompanion: string;
  suggestions: Suggestion[];
  sounds: Record<string, Record<string, string>>;
}

export interface AdminSettings {
  crisisContacts: string;
  defaultCompanion: string;
  suggestions: Suggestion[];
  promptTemplate: string;
  defaultPromptTemplate: string;
  sounds: { companion: string; event: string; updatedAt: number }[];
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  const res = await fetch('/api/site-config');
  if (!res.ok) throw new Error('Could not load site settings');
  return res.json();
}

async function adminRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`/api/admin${path}`, init);
  if (!res.ok && res.status !== 401) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? 'Something went wrong. Please try again.');
  }
  return res;
}

export async function adminLogin(password: string): Promise<void> {
  const res = await adminRequest('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.status === 401) throw new Error('Incorrect password');
}

export async function adminLogout(): Promise<void> {
  await adminRequest('/logout', { method: 'POST' });
}

export async function fetchAdminSettings(): Promise<AdminSettings | null> {
  const res = await adminRequest('/settings');
  return res.status === 401 ? null : res.json();
}

export async function saveAdminSettings(
  settings: Partial<Omit<AdminSettings, 'promptTemplate' | 'defaultPromptTemplate' | 'sounds'>> & {
    promptTemplate?: string | null;
  },
): Promise<void> {
  await adminRequest('/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

export async function uploadSound(companion: string, event: string, file: File): Promise<void> {
  await adminRequest(`/sounds/${companion}/${event}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type.startsWith('audio/') ? file.type : 'audio/mpeg' },
    body: file,
  });
}

export async function removeSound(companion: string, event: string): Promise<void> {
  await adminRequest(`/sounds/${companion}/${event}`, { method: 'DELETE' });
}

export async function fetchCrisisContacts(): Promise<string> {
  const res = await fetch('/api/crisis-contacts');
  if (!res.ok) throw new Error('Could not load help contacts');
  const body: { contacts: string } = await res.json();
  return body.contacts;
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
