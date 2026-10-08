import type { KeyStore } from './keyStore.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChatOptions {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  keyStore: KeyStore;
  cooldownSeconds: number;
  onToken: (token: string) => void;
  fetchImpl?: typeof fetch;
  now?: () => number;
  signal?: AbortSignal;
  log?: (message: string) => void;
}

/** Every key is rate limited, disabled, or failing. Shown to users as a gentle pause. */
export class NoKeysAvailableError extends Error {
  constructor() {
    super('No Ollama Cloud API key is currently available');
    this.name = 'NoKeysAvailableError';
  }
}

/** Ollama rejected the request itself (e.g. unknown model), so switching keys will not help. */
export class OllamaRequestError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`Ollama Cloud returned ${status}: ${detail}`);
    this.name = 'OllamaRequestError';
  }
}

const SERVER_ERROR_COOLDOWN_SECONDS = 15;

function retryAfterMs(header: string | null, fallbackSeconds: number): number {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }
  return fallbackSeconds * 1000;
}

/**
 * Streams a chat completion from Ollama Cloud, failing over between stored keys.
 * Keys are only switched before the first token is sent, so the user never sees a restart.
 * Resolves with the full reply text.
 */
export async function streamChatWithFailover(options: StreamChatOptions): Promise<string> {
  const {
    baseUrl,
    model,
    messages,
    keyStore,
    cooldownSeconds,
    onToken,
    fetchImpl = fetch,
    now = Date.now,
    signal,
    log = () => {},
  } = options;

  const keys = keyStore.availableKeys(now());

  for (const key of keys) {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, stream: true }),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      log(`Key "${key.label}" network error, trying next key`);
      keyStore.markCooldown(key.id, now() + SERVER_ERROR_COOLDOWN_SECONDS * 1000);
      continue;
    }

    if (response.status === 429) {
      const waitMs = retryAfterMs(response.headers.get('retry-after'), cooldownSeconds);
      log(`Key "${key.label}" rate limited, cooling down ${Math.round(waitMs / 1000)}s`);
      keyStore.markCooldown(key.id, now() + waitMs);
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      log(`Key "${key.label}" rejected (${response.status}), disabling it`);
      keyStore.markDisabled(key.id);
      continue;
    }

    if (response.status >= 500) {
      log(`Key "${key.label}" got server error ${response.status}, trying next key`);
      keyStore.markCooldown(key.id, now() + SERVER_ERROR_COOLDOWN_SECONDS * 1000);
      continue;
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new OllamaRequestError(response.status, detail.slice(0, 300));
    }

    keyStore.markSuccess(key.id, now());
    return readNdjsonStream(response.body, onToken);
  }

  throw new NoKeysAvailableError();
}

async function readNdjsonStream(
  body: ReadableStream<Uint8Array>,
  onToken: (token: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string };
    if (chunk.error) throw new OllamaRequestError(200, chunk.error);
    const token = chunk.message?.content;
    if (token) {
      full += token;
      onToken(token);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(handleLine);
  }
  handleLine(buffer + decoder.decode());

  return full;
}
