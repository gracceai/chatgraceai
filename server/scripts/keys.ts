import { createInterface } from 'node:readline/promises';
import { db } from '../src/db.js';
import { insertKey, maskKey } from '../src/keyStore.js';

const [command, ...args] = process.argv.slice(2);

async function add() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const apiKey = (await rl.question('Ollama Cloud API key: ')).trim();
  const label = (await rl.question('Label (e.g. main, backup-1): ')).trim() || 'key';
  const priorityAnswer = (await rl.question('Priority, lower is tried first [100]: ')).trim();
  rl.close();

  if (!apiKey) {
    console.error('No key entered.');
    process.exitCode = 1;
    return;
  }
  const priority = Number.parseInt(priorityAnswer, 10);
  const added = insertKey(db, {
    label,
    apiKey,
    priority: Number.isFinite(priority) ? priority : 100,
  });
  console.log(added ? `Added key "${label}" (${maskKey(apiKey)}).` : 'That key is already stored.');
}

function list() {
  const rows = db
    .prepare(
      'SELECT id, label, api_key, priority, status, cooldown_until, last_used_at, failure_count FROM api_keys ORDER BY priority, id',
    )
    .all() as {
    id: number;
    label: string;
    api_key: string;
    priority: number;
    status: string;
    cooldown_until: number | null;
    last_used_at: number | null;
    failure_count: number;
  }[];

  if (rows.length === 0) {
    console.log('No keys stored. Add one with: npm run keys:add');
    return;
  }
  const now = Date.now();
  console.table(
    rows.map((row) => ({
      id: row.id,
      label: row.label,
      key: maskKey(row.api_key),
      priority: row.priority,
      status:
        row.status === 'active' && row.cooldown_until && row.cooldown_until > now
          ? `cooling down (${Math.ceil((row.cooldown_until - now) / 1000)}s)`
          : row.status,
      lastUsed: row.last_used_at ? new Date(row.last_used_at).toLocaleString() : '-',
      failures: row.failure_count,
    })),
  );
}

function remove() {
  const id = Number.parseInt(args[0] ?? '', 10);
  if (!Number.isFinite(id)) {
    console.error('Usage: npm run keys:remove -- <id>   (see ids with npm run keys:list)');
    process.exitCode = 1;
    return;
  }
  const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
  console.log(Number(result.changes) > 0 ? `Removed key ${id}.` : `No key with id ${id}.`);
}

switch (command) {
  case 'add':
    await add();
    break;
  case 'list':
    list();
    break;
  case 'remove':
    remove();
    break;
  default:
    console.error('Usage: keys.ts <add|list|remove>');
    process.exitCode = 1;
}
