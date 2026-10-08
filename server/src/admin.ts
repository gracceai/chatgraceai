import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { CRISIS_PLACEHOLDER, DEFAULT_PROMPT_TEMPLATE } from './prompt.js';
import {
  deleteSound,
  getCrisisContacts,
  getDefaultCompanion,
  getPromptTemplate,
  getSuggestions,
  isCompanion,
  isSoundEvent,
  listSounds,
  parseSuggestions,
  putSound,
  setCrisisContacts,
  setDefaultCompanion,
  setPromptTemplate,
  setSuggestions,
  sniffAudioMime,
} from './siteSettings.js';

const COOKIE_NAME = 'grace_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_CONTACTS_LENGTH = 500;
const MAX_PROMPT_LENGTH = 8000;
const MAX_SOUND_BYTES = 1024 * 1024;
const LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const sessionKey = randomBytes(32);

export function signSession(expiresAt: number, key: Buffer = sessionKey): string {
  const payload = String(expiresAt);
  return `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`;
}

export function verifySession(token: string | undefined, now: number, key: Buffer = sessionKey): boolean {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = createHmac('sha256', key).update(payload).digest('base64url');
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted) && Number(payload) > now;
}

export function passwordMatches(candidate: string, expected: string): boolean {
  if (!expected) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}

export class LoginLimiter {
  private attempts = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now: number): boolean {
    const recent = (this.attempts.get(key) ?? []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.max) {
      this.attempts.set(key, recent);
      return false;
    }
    this.attempts.set(key, [...recent, now]);
    return true;
  }

  reset(key: string) {
    this.attempts.delete(key);
  }
}

function cookieOf(req: Request, name: string): string | undefined {
  const header = req.header('cookie') ?? '';
  const pair = header.split(';').find((part) => part.trim().startsWith(`${name}=`));
  return pair?.trim().slice(name.length + 1);
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!verifySession(cookieOf(req, COOKIE_NAME), Date.now())) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }
  next();
}

export function adminRouter(): Router {
  const router = Router();
  const limiter = new LoginLimiter(LOGIN_ATTEMPTS, LOGIN_WINDOW_MS);

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!config.adminPassword) {
      res.status(503).json({ error: 'Admin is not configured' });
      return;
    }
    next();
  });

  router.post('/login', (req, res) => {
    const key = req.ip ?? 'unknown';
    if (!limiter.allow(key, Date.now())) {
      res.status(429).json({ error: 'Too many attempts. Try again later.' });
      return;
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!passwordMatches(password, config.adminPassword)) {
      res.status(401).json({ error: 'Incorrect password' });
      return;
    }
    limiter.reset(key);
    res.cookie(COOKIE_NAME, signSession(Date.now() + SESSION_TTL_MS), {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
      maxAge: SESSION_TTL_MS,
      path: '/api',
    });
    res.status(204).end();
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/api' });
    res.status(204).end();
  });

  router.use(requireAdmin);

  router.get('/session', (_req, res) => {
    res.json({ ok: true });
  });

  router.get('/settings', (_req, res) => {
    res.json({
      crisisContacts: getCrisisContacts(),
      defaultCompanion: getDefaultCompanion(),
      suggestions: getSuggestions(),
      promptTemplate: getPromptTemplate(),
      defaultPromptTemplate: DEFAULT_PROMPT_TEMPLATE,
      sounds: listSounds(),
    });
  });

  router.put('/settings', (req, res) => {
    const { crisisContacts, defaultCompanion, suggestions, promptTemplate } = req.body ?? {};

    if (crisisContacts !== undefined) {
      const trimmed = typeof crisisContacts === 'string' ? crisisContacts.trim() : '';
      if (!trimmed || trimmed.length > MAX_CONTACTS_LENGTH) {
        res.status(400).json({ error: `Crisis contacts must be 1-${MAX_CONTACTS_LENGTH} characters` });
        return;
      }
    }
    if (defaultCompanion !== undefined && !(typeof defaultCompanion === 'string' && isCompanion(defaultCompanion))) {
      res.status(400).json({ error: 'Unknown companion' });
      return;
    }
    const parsedSuggestions = suggestions === undefined ? undefined : parseSuggestions(suggestions);
    if (parsedSuggestions === null) {
      res.status(400).json({ error: 'Suggestions need 1-8 items, each with a short label and message' });
      return;
    }
    if (promptTemplate !== undefined && promptTemplate !== null) {
      if (
        typeof promptTemplate !== 'string' ||
        promptTemplate.length > MAX_PROMPT_LENGTH ||
        !promptTemplate.includes(CRISIS_PLACEHOLDER)
      ) {
        res.status(400).json({
          error: `The prompt must be under ${MAX_PROMPT_LENGTH} characters and keep ${CRISIS_PLACEHOLDER} so crisis contacts reach Grace`,
        });
        return;
      }
    }

    if (crisisContacts !== undefined) setCrisisContacts(crisisContacts.trim());
    if (defaultCompanion !== undefined) setDefaultCompanion(defaultCompanion);
    if (parsedSuggestions) setSuggestions(parsedSuggestions);
    if (promptTemplate !== undefined) setPromptTemplate(promptTemplate);
    res.status(204).end();
  });

  router.put(
    '/sounds/:companion/:event',
    express.raw({ type: 'audio/*', limit: MAX_SOUND_BYTES }),
    (req, res) => {
      const { companion, event } = req.params;
      if (!isCompanion(companion) || !isSoundEvent(event)) {
        res.status(404).json({ error: 'Unknown sound slot' });
        return;
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(415).json({ error: 'Send an audio file as the request body' });
        return;
      }
      const mime = sniffAudioMime(req.body);
      if (!mime) {
        res.status(415).json({ error: 'Use an MP3, OGG, WAV, M4A or WebM file' });
        return;
      }
      putSound(companion, event, mime, req.body);
      res.status(204).end();
    },
  );

  router.delete('/sounds/:companion/:event', (req, res) => {
    const { companion, event } = req.params;
    if (!isCompanion(companion) || !isSoundEvent(event) || !deleteSound(companion, event)) {
      res.status(404).json({ error: 'Sound not found' });
      return;
    }
    res.status(204).end();
  });

  router.use((error: { type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (error.type === 'entity.too.large') {
      res.status(413).json({ error: 'That file is over 1 MB' });
      return;
    }
    next(error);
  });

  return router;
}
