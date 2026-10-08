import express, { type Request, type Response } from 'express';
import { adminRouter } from './admin.js';
import { config } from './config.js';
import {
  addMessage,
  createConversation,
  deleteConversation,
  getMessages,
  getRecentMessages,
  isOwnedBy,
  listConversations,
} from './conversations.js';
import { db } from './db.js';
import { createSqliteKeyStore, insertKey } from './keyStore.js';
import { NoKeysAvailableError, streamChatWithFailover, type ChatMessage } from './ollama.js';
import { buildSystemPrompt } from './prompt.js';
import {
  getCrisisContacts,
  getDefaultCompanion,
  getPromptTemplate,
  getSound,
  getSuggestions,
  isCompanion,
  isSoundEvent,
  listSounds,
} from './siteSettings.js';

const MAX_MESSAGE_LENGTH = 4000;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]{16,64}$/;

const keyStore = createSqliteKeyStore(db);

config.envApiKeys.forEach((apiKey, index) => {
  if (insertKey(db, { label: `env-${index + 1}`, apiKey, priority: 100 + index })) {
    console.log(`Imported Ollama key env-${index + 1} from OLLAMA_API_KEYS`);
  }
});

const app = express();
app.use(express.json({ limit: '64kb' }));

function sessionIdOf(req: Request, res: Response): string | null {
  const sessionId = req.header('x-session-id');
  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    res.status(400).json({ error: 'Missing or invalid session' });
    return null;
  }
  return sessionId;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, keysAvailable: keyStore.availableKeys(Date.now()).length });
});

app.use('/api/admin', adminRouter());

app.get('/api/crisis-contacts', (_req, res) => {
  res.json({ contacts: getCrisisContacts() });
});

app.get('/api/site-config', (_req, res) => {
  const sounds: Record<string, Record<string, string>> = {};
  for (const { companion, event, updatedAt } of listSounds()) {
    sounds[companion] = { ...sounds[companion], [event]: `/api/sounds/${companion}/${event}?v=${updatedAt}` };
  }
  res.json({ defaultCompanion: getDefaultCompanion(), suggestions: getSuggestions(), sounds });
});

app.get('/api/sounds/:companion/:event', (req, res) => {
  const { companion, event } = req.params;
  const sound = isCompanion(companion) && isSoundEvent(event) ? getSound(companion, event) : undefined;
  if (!sound) {
    res.status(404).json({ error: 'Sound not found' });
    return;
  }
  res.setHeader('Content-Type', sound.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.end(sound.data);
});

app.get('/api/conversations', (req, res) => {
  const sessionId = sessionIdOf(req, res);
  if (!sessionId) return;
  res.json(listConversations(sessionId));
});

app.get('/api/conversations/:id/messages', (req, res) => {
  const sessionId = sessionIdOf(req, res);
  if (!sessionId) return;
  if (!isOwnedBy(req.params.id, sessionId)) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  res.json(getMessages(req.params.id));
});

app.delete('/api/conversations/:id', (req, res) => {
  const sessionId = sessionIdOf(req, res);
  if (!sessionId) return;
  if (!deleteConversation(req.params.id, sessionId)) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  res.status(204).end();
});

app.post('/api/chat', async (req, res) => {
  const sessionId = sessionIdOf(req, res);
  if (!sessionId) return;

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: `Message must be 1-${MAX_MESSAGE_LENGTH} characters` });
    return;
  }

  let conversationId: string | undefined = req.body?.conversationId;
  if (conversationId) {
    if (!isOwnedBy(conversationId, sessionId)) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
  } else {
    conversationId = createConversation(sessionId, message);
  }

  addMessage(conversationId, 'user', message);

  const history: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(getCrisisContacts(), getPromptTemplate()) },
    ...getRecentMessages(conversationId, config.historyLimit),
  ];

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  const send = (event: object) => res.write(`${JSON.stringify(event)}\n`);
  send({ type: 'meta', conversationId });

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });

  try {
    const reply = await streamChatWithFailover({
      baseUrl: config.ollamaBaseUrl,
      model: config.ollamaModel,
      messages: history,
      keyStore,
      cooldownSeconds: config.keyCooldownSeconds,
      onToken: (token) => send({ type: 'token', content: token }),
      signal: abort.signal,
      log: (line) => console.warn(`[keys] ${line}`),
    });
    if (reply.trim()) addMessage(conversationId, 'assistant', reply);
    send({ type: 'done' });
  } catch (error) {
    if (abort.signal.aborted) return;
    console.error('[chat]', error);
    send({
      type: 'error',
      message:
        error instanceof NoKeysAvailableError
          ? 'Grace is taking a short pause. Please try again in a moment.'
          : 'Something went wrong while Grace was replying. Please try again.',
    });
  } finally {
    res.end();
  }
});

app.listen(config.port, () => {
  const keys = keyStore.availableKeys(Date.now()).length;
  console.log(`GraceAI server listening on http://localhost:${config.port} (model ${config.ollamaModel})`);
  if (keys === 0) {
    console.warn('No Ollama Cloud keys yet. Add one with: npm run keys:add');
  }
});
