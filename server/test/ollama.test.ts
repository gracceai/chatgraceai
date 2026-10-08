import { describe, expect, it, vi } from 'vitest';
import type { ApiKeyRecord, KeyStore } from '../src/keyStore.js';
import {
  NoKeysAvailableError,
  OllamaRequestError,
  streamChatWithFailover,
} from '../src/ollama.js';

interface FakeKey extends ApiKeyRecord {
  status: 'active' | 'disabled';
  cooldownUntil: number | null;
  lastUsedAt: number | null;
}

function createFakeStore(labels: string[]) {
  const keys: FakeKey[] = labels.map((label, index) => ({
    id: index + 1,
    label,
    apiKey: `key-${label}`,
    priority: index,
    status: 'active',
    cooldownUntil: null,
    lastUsedAt: null,
  }));

  const store: KeyStore = {
    availableKeys: (now) =>
      keys.filter(
        (key) => key.status === 'active' && (key.cooldownUntil === null || key.cooldownUntil <= now),
      ),
    markSuccess: (id, now) => {
      const key = keys.find((k) => k.id === id)!;
      key.lastUsedAt = now;
      key.cooldownUntil = null;
    },
    markCooldown: (id, until) => {
      keys.find((k) => k.id === id)!.cooldownUntil = until;
    },
    markDisabled: (id) => {
      keys.find((k) => k.id === id)!.status = 'disabled';
    },
  };

  return { store, keys };
}

function streamResponse(tokens: string[]): Response {
  const lines = tokens
    .map((content) => JSON.stringify({ message: { role: 'assistant', content }, done: false }))
    .concat(JSON.stringify({ done: true }))
    .join('\n');
  return new Response(lines, { status: 200 });
}

function authHeaderOf(init: RequestInit | undefined): string {
  return (init?.headers as Record<string, string>).Authorization;
}

const NOW = 1_000_000;
const baseOptions = {
  baseUrl: 'https://ollama.test',
  model: 'test-model',
  messages: [{ role: 'user' as const, content: 'hello' }],
  cooldownSeconds: 60,
  now: () => NOW,
};

describe('streamChatWithFailover', () => {
  it('streams tokens using the first available key', async () => {
    const { store, keys } = createFakeStore(['a', 'b']);
    const fetchImpl = vi.fn<typeof fetch>(async () => streamResponse(['Hi', ' there']));
    const tokens: string[] = [];

    const reply = await streamChatWithFailover({
      ...baseOptions,
      keyStore: store,
      fetchImpl,
      onToken: (t) => tokens.push(t),
    });

    expect(reply).toBe('Hi there');
    expect(tokens).toEqual(['Hi', ' there']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(authHeaderOf(fetchImpl.mock.calls[0][1])).toBe('Bearer key-a');
    expect(keys[0].lastUsedAt).toBe(NOW);
  });

  it('switches to the next key on 429 and cools down the limited key', async () => {
    const { store, keys } = createFakeStore(['a', 'b']);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(streamResponse(['ok']));

    const reply = await streamChatWithFailover({
      ...baseOptions,
      keyStore: store,
      fetchImpl,
      onToken: () => {},
    });

    expect(reply).toBe('ok');
    expect(authHeaderOf(fetchImpl.mock.calls[1][1])).toBe('Bearer key-b');
    expect(keys[0].cooldownUntil).toBe(NOW + 60_000);
    expect(keys[0].status).toBe('active');
  });

  it('honours the Retry-After header', async () => {
    const { store, keys } = createFakeStore(['a', 'b']);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'Retry-After': '5' } }),
      )
      .mockResolvedValueOnce(streamResponse(['ok']));

    await streamChatWithFailover({ ...baseOptions, keyStore: store, fetchImpl, onToken: () => {} });

    expect(keys[0].cooldownUntil).toBe(NOW + 5_000);
  });

  it('disables a key rejected with 401', async () => {
    const { store, keys } = createFakeStore(['a', 'b']);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(streamResponse(['ok']));

    await streamChatWithFailover({ ...baseOptions, keyStore: store, fetchImpl, onToken: () => {} });

    expect(keys[0].status).toBe('disabled');
  });

  it('skips keys that are still cooling down', async () => {
    const { store, keys } = createFakeStore(['a', 'b']);
    keys[0].cooldownUntil = NOW + 10_000;
    const fetchImpl = vi.fn<typeof fetch>(async () => streamResponse(['ok']));

    await streamChatWithFailover({ ...baseOptions, keyStore: store, fetchImpl, onToken: () => {} });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(authHeaderOf(fetchImpl.mock.calls[0][1])).toBe('Bearer key-b');
  });

  it('throws NoKeysAvailableError when every key is rate limited', async () => {
    const { store } = createFakeStore(['a', 'b']);
    const fetchImpl = vi.fn(async () => new Response('', { status: 429 }));

    await expect(
      streamChatWithFailover({ ...baseOptions, keyStore: store, fetchImpl, onToken: () => {} }),
    ).rejects.toBeInstanceOf(NoKeysAvailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws NoKeysAvailableError when there are no keys at all', async () => {
    const { store } = createFakeStore([]);

    await expect(
      streamChatWithFailover({ ...baseOptions, keyStore: store, fetchImpl: vi.fn(), onToken: () => {} }),
    ).rejects.toBeInstanceOf(NoKeysAvailableError);
  });

  it('does not rotate keys for request errors like an unknown model', async () => {
    const { store } = createFakeStore(['a', 'b']);
    const fetchImpl = vi.fn(async () => new Response('model not found', { status: 404 }));

    await expect(
      streamChatWithFailover({ ...baseOptions, keyStore: store, fetchImpl, onToken: () => {} }),
    ).rejects.toBeInstanceOf(OllamaRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
