import type { DatabaseSync } from 'node:sqlite';

export interface ApiKeyRecord {
  id: number;
  label: string;
  apiKey: string;
  priority: number;
}

export interface KeyStore {
  /** Active keys not cooling down, in the order they should be tried. */
  availableKeys(now: number): ApiKeyRecord[];
  markSuccess(id: number, now: number): void;
  markCooldown(id: number, until: number): void;
  markDisabled(id: number): void;
}

interface ApiKeyRow {
  id: number;
  label: string;
  api_key: string;
  priority: number;
}

export function createSqliteKeyStore(db: DatabaseSync): KeyStore {
  const selectAvailable = db.prepare(`
    SELECT id, label, api_key, priority FROM api_keys
    WHERE status = 'active' AND (cooldown_until IS NULL OR cooldown_until <= ?)
    ORDER BY priority ASC, last_used_at ASC NULLS FIRST, id ASC
  `);
  const success = db.prepare(
    'UPDATE api_keys SET last_used_at = ?, cooldown_until = NULL, failure_count = 0 WHERE id = ?',
  );
  const cooldown = db.prepare(
    'UPDATE api_keys SET cooldown_until = ?, failure_count = failure_count + 1 WHERE id = ?',
  );
  const disable = db.prepare(
    "UPDATE api_keys SET status = 'disabled', failure_count = failure_count + 1 WHERE id = ?",
  );

  return {
    availableKeys(now) {
      return (selectAvailable.all(now) as unknown as ApiKeyRow[]).map((row) => ({
        id: row.id,
        label: row.label,
        apiKey: row.api_key,
        priority: row.priority,
      }));
    },
    markSuccess(id, now) {
      success.run(now, id);
    },
    markCooldown(id, until) {
      cooldown.run(until, id);
    },
    markDisabled(id) {
      disable.run(id);
    },
  };
}

export function insertKey(
  db: DatabaseSync,
  { label, apiKey, priority = 100 }: { label: string; apiKey: string; priority?: number },
): boolean {
  const result = db
    .prepare(
      'INSERT OR IGNORE INTO api_keys (label, api_key, priority, created_at) VALUES (?, ?, ?, ?)',
    )
    .run(label, apiKey, priority, Date.now());
  return Number(result.changes) > 0;
}

export function maskKey(apiKey: string): string {
  return apiKey.length <= 8 ? '****' : `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}
