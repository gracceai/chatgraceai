import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.resolve(serverRoot, '..', '.env');

if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

function intFromEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  port: intFromEnv('PORT', 3001),
  ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || 'https://ollama.com').replace(/\/+$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'gpt-oss:120b',
  envApiKeys: (process.env.OLLAMA_API_KEYS ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean),
  keyCooldownSeconds: intFromEnv('KEY_COOLDOWN_SECONDS', 60),
  dbPath: path.resolve(serverRoot, process.env.DB_PATH || 'data/grace.db'),
  crisisContacts:
    process.env.CRISIS_CONTACTS || 'your local emergency services or the nearest hospital',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  historyLimit: 20,
};
