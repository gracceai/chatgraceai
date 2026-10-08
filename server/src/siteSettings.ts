import { config } from './config.js';
import { db } from './db.js';
import { DEFAULT_PROMPT_TEMPLATE } from './prompt.js';

export const COMPANIONS = ['pebble', 'sprout', 'orb'] as const;
export const SOUND_EVENTS = ['send', 'reply', 'thinking', 'support'] as const;

export type Companion = (typeof COMPANIONS)[number];
export type SoundEvent = (typeof SOUND_EVENTS)[number];

export const isCompanion = (value: string): value is Companion =>
  COMPANIONS.some((companion) => companion === value);
export const isSoundEvent = (value: string): value is SoundEvent =>
  SOUND_EVENTS.some((event) => event === value);

export interface Suggestion {
  label: string;
  message: string;
}

export const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { label: 'Ease anxious thoughts', message: "I've been feeling anxious lately" },
  { label: 'Improve my sleep', message: "I can't seem to sleep well" },
  { label: 'Manage work stress', message: 'Work stress is overwhelming me' },
  { label: 'Talk things through', message: 'I just need someone to talk to' },
];

const MAX_SUGGESTIONS = 8;
const MAX_SUGGESTION_LABEL = 40;
const MAX_SUGGESTION_MESSAGE = 200;

export function parseSuggestions(value: unknown): Suggestion[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SUGGESTIONS) return null;
  const parsed: Suggestion[] = [];
  for (const item of value) {
    const label = typeof item?.label === 'string' ? item.label.trim() : '';
    const message = typeof item?.message === 'string' ? item.message.trim() : '';
    if (!label || label.length > MAX_SUGGESTION_LABEL) return null;
    if (!message || message.length > MAX_SUGGESTION_MESSAGE) return null;
    parsed.push({ label, message });
  }
  return parsed;
}

export interface StoredSound {
  mime: string;
  data: Uint8Array;
  updatedAt: number;
}

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const putSettingStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
);
const deleteSettingStmt = db.prepare('DELETE FROM settings WHERE key = ?');
const getSoundStmt = db.prepare(
  'SELECT mime, data, updated_at FROM sounds WHERE companion = ? AND event = ?',
);
const listSoundsStmt = db.prepare('SELECT companion, event, updated_at FROM sounds');
const putSoundStmt = db.prepare(`
  INSERT INTO sounds (companion, event, mime, data, updated_at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (companion, event) DO UPDATE SET
    mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at
`);
const deleteSoundStmt = db.prepare('DELETE FROM sounds WHERE companion = ? AND event = ?');

export function getCrisisContacts(): string {
  const row = getSettingStmt.get('crisis_contacts') as { value: string } | undefined;
  return row?.value ?? config.crisisContacts;
}

export function setCrisisContacts(value: string) {
  putSettingStmt.run('crisis_contacts', value);
}

export function getDefaultCompanion(): Companion {
  const row = getSettingStmt.get('default_companion') as { value: string } | undefined;
  return row && isCompanion(row.value) ? row.value : 'pebble';
}

export function setDefaultCompanion(companion: Companion) {
  putSettingStmt.run('default_companion', companion);
}

export function getSuggestions(): Suggestion[] {
  const row = getSettingStmt.get('suggestions') as { value: string } | undefined;
  return (row && parseSuggestions(JSON.parse(row.value))) || DEFAULT_SUGGESTIONS;
}

export function setSuggestions(suggestions: Suggestion[]) {
  putSettingStmt.run('suggestions', JSON.stringify(suggestions));
}

export function getPromptTemplate(): string {
  const row = getSettingStmt.get('prompt_template') as { value: string } | undefined;
  return row?.value ?? DEFAULT_PROMPT_TEMPLATE;
}

export function setPromptTemplate(template: string | null) {
  if (template === null) deleteSettingStmt.run('prompt_template');
  else putSettingStmt.run('prompt_template', template);
}

export function getSound(companion: Companion, event: SoundEvent): StoredSound | undefined {
  const row = getSoundStmt.get(companion, event) as
    | { mime: string; data: Uint8Array; updated_at: number }
    | undefined;
  return row && { mime: row.mime, data: row.data, updatedAt: row.updated_at };
}

export function listSounds(): { companion: Companion; event: SoundEvent; updatedAt: number }[] {
  return (
    listSoundsStmt.all() as { companion: Companion; event: SoundEvent; updated_at: number }[]
  ).map((row) => ({ companion: row.companion, event: row.event, updatedAt: row.updated_at }));
}

export function putSound(companion: Companion, event: SoundEvent, mime: string, data: Uint8Array) {
  putSoundStmt.run(companion, event, mime, data, Date.now());
}

export function deleteSound(companion: Companion, event: SoundEvent): boolean {
  return Number(deleteSoundStmt.run(companion, event).changes) > 0;
}

export function sniffAudioMime(data: Uint8Array): string | null {
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...data.subarray(start, start + length));
  if (ascii(0, 3) === 'ID3' || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'audio/wav';
  if (ascii(4, 4) === 'ftyp') return 'audio/mp4';
  if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) return 'audio/webm';
  return null;
}
