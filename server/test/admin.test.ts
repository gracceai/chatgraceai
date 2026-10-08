import { mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DB_PATH = path.join(mkdtempSync(path.join(tmpdir(), 'grace-test-')), 'test.db');
process.env.ADMIN_PASSWORD = 'correct horse battery staple';

const { LoginLimiter, adminRouter, passwordMatches, signSession, verifySession } = await import('../src/admin.js');
const settings = await import('../src/siteSettings.js');

const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(8)]);

describe('session tokens', () => {
  const key = Buffer.from('k'.repeat(32));

  it('accepts a fresh token and rejects expired, tampered and empty ones', () => {
    const token = signSession(2000, key);
    expect(verifySession(token, 1000, key)).toBe(true);
    expect(verifySession(token, 2000, key)).toBe(false);
    expect(verifySession(token.replace('2000', '9999'), 1000, key)).toBe(false);
    expect(verifySession(undefined, 1000, key)).toBe(false);
    expect(verifySession('garbage', 1000, key)).toBe(false);
  });

  it('rejects a token signed with another key', () => {
    expect(verifySession(signSession(2000, Buffer.from('a'.repeat(32))), 1000, key)).toBe(false);
  });
});

describe('passwordMatches', () => {
  it('matches only the exact password and never an empty one', () => {
    expect(passwordMatches('secret', 'secret')).toBe(true);
    expect(passwordMatches('Secret', 'secret')).toBe(false);
    expect(passwordMatches('', '')).toBe(false);
  });
});

describe('LoginLimiter', () => {
  it('blocks after the limit and allows again once the window passes', () => {
    const limiter = new LoginLimiter(2, 1000);
    expect(limiter.allow('ip', 0)).toBe(true);
    expect(limiter.allow('ip', 10)).toBe(true);
    expect(limiter.allow('ip', 20)).toBe(false);
    expect(limiter.allow('other', 20)).toBe(true);
    expect(limiter.allow('ip', 1500)).toBe(true);
  });
});

describe('site settings storage', () => {
  it('falls back to defaults and then returns saved values', () => {
    expect(settings.getDefaultCompanion()).toBe('pebble');
    settings.setDefaultCompanion('orb');
    expect(settings.getDefaultCompanion()).toBe('orb');

    expect(settings.getSuggestions()).toEqual(settings.DEFAULT_SUGGESTIONS);
    settings.setSuggestions([{ label: 'Breathe', message: 'Help me breathe' }]);
    expect(settings.getSuggestions()).toEqual([{ label: 'Breathe', message: 'Help me breathe' }]);

    settings.setPromptTemplate('Custom {{crisisContacts}}');
    expect(settings.getPromptTemplate()).toBe('Custom {{crisisContacts}}');
    settings.setPromptTemplate(null);
    expect(settings.getPromptTemplate()).toContain('You are Grace');
  });

  it('stores, replaces and removes a sound', () => {
    settings.putSound('sprout', 'send', 'audio/wav', WAV);
    expect(settings.getSound('sprout', 'send')?.mime).toBe('audio/wav');
    settings.putSound('sprout', 'send', 'audio/ogg', WAV);
    expect(settings.listSounds()).toHaveLength(1);
    expect(settings.deleteSound('sprout', 'send')).toBe(true);
    expect(settings.deleteSound('sprout', 'send')).toBe(false);
  });

  it('validates suggestions', () => {
    expect(settings.parseSuggestions([])).toBeNull();
    expect(settings.parseSuggestions([{ label: '', message: 'x' }])).toBeNull();
    expect(settings.parseSuggestions([{ label: 'x'.repeat(41), message: 'x' }])).toBeNull();
    expect(settings.parseSuggestions([{ label: ' Hi ', message: ' there ' }])).toEqual([
      { label: 'Hi', message: 'there' },
    ]);
  });

  it('recognises audio by content, not by name', () => {
    expect(settings.sniffAudioMime(WAV)).toBe('audio/wav');
    expect(settings.sniffAudioMime(Buffer.from('OggS....'))).toBe('audio/ogg');
    expect(settings.sniffAudioMime(Buffer.from('<html>not audio</html>'))).toBeNull();
  });
});

describe('admin routes', () => {
  let server: Server;
  let base: string;
  let cookie = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json({ limit: '64kb' }));
    app.use('/api/admin', adminRouter());
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin`;
  });

  afterAll(() => {
    server.close();
  });

  const call = (method: string, route: string, body?: BodyInit, headers: Record<string, string> = {}) =>
    fetch(`${base}${route}`, { method, body, headers: { ...(cookie && { cookie }), ...headers } });
  const json = (method: string, route: string, value: unknown) =>
    call(method, route, JSON.stringify(value), { 'content-type': 'application/json' });

  it('rejects requests without a session and a wrong password', async () => {
    expect((await call('GET', '/settings')).status).toBe(401);
    expect((await json('POST', '/login', { password: 'nope' })).status).toBe(401);
    expect((await call('PUT', '/sounds/pebble/send', WAV, { 'content-type': 'audio/wav' })).status).toBe(401);
  });

  it('signs in with a protected cookie and then serves settings', async () => {
    const login = await json('POST', '/login', { password: process.env.ADMIN_PASSWORD });
    expect(login.status).toBe(204);
    const setCookie = login.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    cookie = setCookie.split(';')[0];

    const res = await call('GET', '/settings');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ defaultCompanion: expect.any(String) });
  });

  it('saves crisis contacts and refuses a prompt that drops the contacts placeholder', async () => {
    expect((await json('PUT', '/settings', { crisisContacts: '  Call 999  ' })).status).toBe(204);
    expect(settings.getCrisisContacts()).toBe('Call 999');
    expect((await json('PUT', '/settings', { crisisContacts: '   ' })).status).toBe(400);

    const noPlaceholder = await json('PUT', '/settings', { promptTemplate: 'You are Grace.' });
    expect(noPlaceholder.status).toBe(400);
    expect(settings.getPromptTemplate()).toContain('{{crisisContacts}}');
  });

  it('rejects an unknown companion and invalid suggestions without saving anything', async () => {
    const before = settings.getDefaultCompanion();
    const res = await json('PUT', '/settings', { defaultCompanion: 'dragon', crisisContacts: 'Changed' });
    expect(res.status).toBe(400);
    expect(settings.getDefaultCompanion()).toBe(before);
    expect(settings.getCrisisContacts()).toBe('Call 999');
    expect((await json('PUT', '/settings', { suggestions: [] })).status).toBe(400);
  });

  it('accepts a real audio upload and refuses other content', async () => {
    expect((await call('PUT', '/sounds/orb/reply', WAV, { 'content-type': 'audio/wav' })).status).toBe(204);
    expect(settings.getSound('orb', 'reply')?.mime).toBe('audio/wav');

    const fake = await call('PUT', '/sounds/orb/reply', Buffer.from('<html>'), { 'content-type': 'audio/wav' });
    expect(fake.status).toBe(415);
    const wrongType = await call('PUT', '/sounds/orb/reply', WAV, { 'content-type': 'text/plain' });
    expect(wrongType.status).toBe(415);
    const unknownSlot = await call('PUT', '/sounds/orb/boom', WAV, { 'content-type': 'audio/wav' });
    expect(unknownSlot.status).toBe(404);
  });

  it('rejects files over 1 MB', async () => {
    const big = Buffer.concat([WAV, Buffer.alloc(1024 * 1024)]);
    const res = await call('PUT', '/sounds/orb/send', big, { 'content-type': 'audio/wav' });
    expect(res.status).toBe(413);
  });

  it('removes a sound and ends the session on logout', async () => {
    expect((await call('DELETE', '/sounds/orb/reply')).status).toBe(204);
    expect((await call('DELETE', '/sounds/orb/reply')).status).toBe(404);
    expect((await call('POST', '/logout')).status).toBe(204);
  });
});
