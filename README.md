# GraceAI Chat

The web chat for [GraceAI](https://graceai.com.na/): a warm, culturally-aware mental wellness companion for Namibia, powered by [Ollama Cloud](https://ollama.com).

- **React + Vite + Tailwind** frontend styled to match graceai.com.na
- **Node + Express** backend that streams Grace's replies
- **SQLite** database (built into Node, no setup) for API keys, conversations and messages
- **Automatic API key failover**: Ollama Cloud keys live in the database. When one key is rate limited (HTTP 429) or rejected, the server silently switches to the next one. Users never see which key is in use.
- **Anonymous by default**: no sign-up; chat history is tied to the user's browser.

## Requirements

- Node.js 22.13 or newer (uses the built-in `node:sqlite` module)
- One or more [Ollama Cloud API keys](https://ollama.com/settings/keys)

## Run on localhost

```bash
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm run keys:add            # paste an Ollama Cloud key; repeat to add backups
npm run dev
```

Open http://localhost:5173. The API server runs on http://localhost:3001 and the React dev server proxies `/api` to it.

## Managing API keys

| Command | What it does |
| --- | --- |
| `npm run keys:add` | Add a key (prompts for key, label and priority) |
| `npm run keys:list` | Show keys (masked), status, cooldowns and failures |
| `npm run keys:remove -- <id>` | Delete a key |

Keys are tried in order of **priority** (lower first), then least recently used.

- **429 rate limited**: the key cools down for the `Retry-After` time, or `KEY_COOLDOWN_SECONDS` (default 60s), and the next key is used.
- **401/403 rejected**: the key is disabled.
- **5xx or network error**: the key rests 15s and the next key is used.
- **All keys unavailable**: the user sees "Grace is taking a short pause. Please try again in a moment."

Keys are only switched before Grace starts replying, so a reply is never cut off and restarted.

## Configuration

See [`.env.example`](.env.example). Key settings:

- `OLLAMA_MODEL`: the Ollama Cloud model (default `gpt-oss:120b`)
- `CRISIS_CONTACTS`: what Grace tells someone who may be in danger. **Set this to the confirmed Namibian helpline numbers before going live.**

## Project layout

```
client/              React app
  src/App.tsx        Chat screen and state
  src/components/    Sidebar, messages, composer
  src/lib/api.ts     API calls and streaming
server/
  src/index.ts       Express API (/api/chat, /api/conversations)
  src/ollama.ts      Ollama Cloud client with key failover
  src/keyStore.ts    Key storage and rotation state
  src/prompt.ts      Grace's system prompt
  scripts/keys.ts    keys:add / keys:list / keys:remove
  test/              Failover tests (npm test)
```

## Privacy notes

`.env` and the SQLite database (`server/data/`) are git-ignored, so keys and chats are never committed. Keys are stored in plain text in the local database; protect the machine or move to a managed secret store before deploying.
