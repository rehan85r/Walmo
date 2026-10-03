# Walmo — Your AI, Your Memory

Walmo is a personal AI helper for everyday questions, learning, writing, planning
and practical guidance. It recalls useful facts, preferences and goals across
conversations using Walrus Memory on mainnet. Replies use OpenRouter, with
`google/gemini-2.5-flash` as the default model.

Live app: https://walmo.vercel.app

## How memory works

The backend selects a namespace from a verified Google session or a signed browser
session. It calls MemWal `recall` before generating a reply, then defers `analyze`
of eligible user messages with Vercel `waitUntil`. Matching secrets skip memory
saving. Recall/classifier failures fall back to ordinary chat. Background saving
and indexing can fail or take time: a reply is not proof of a successful save.

Slush remains a frontend wallet connection. It does not create a server-verified
wallet identity; memory is scoped to Google or the signed browser session.

Chat history and long-term memory are separate. Cloud Recents uses Redis for
Google accounts. Historical tutor/tracker records are ignored by normal recall,
not erased remotely. The experimental dashboard, project reports and forced tutor
quizzes have been removed.

## Architecture

- `index.html`: chat UI, sidebar, wallet connection and browser history.
- `google-auth.js`: Google login UI and session synchronization.
- `attachment-patch.js`: attachment integration.
- `api/chat.js`: chat, memory, language preferences, web tools, live time,
  rate limiting and secret detection.
- `api/auth.js`: Google ID-token verification and signed session cookies.
- `api/recents.js`: account-scoped cloud chat history.
- `package.json` / `package-lock.json`: pinned backend dependencies.
- `vercel.json`: 60-second chat function duration.

## Environment variables

Configure values privately in Vercel; never commit credentials.

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Required signing secret, minimum 32 characters. Keep it stable to preserve namespace continuity. |
| `MEMWAL_PRIVATE_KEY` | Required key for your Walrus Memory account. |
| `MEMWAL_ACCOUNT_ID` | Required memory account ID. |
| `OPENROUTER_API_KEY` | Required model and web-tool access. |
| `OPENROUTER_MODEL` | Optional model override. |
| `GOOGLE_CLIENT_ID` | Google web OAuth client ID for login. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Redis REST credentials for cloud Recents. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Alternative Redis credential pair; use one complete pair. |

The relayer is `https://relayer.memory.walrus.xyz`. Google's authorized JavaScript
origins must include your deployed origin and the exact local origin if testing
Google login locally.

## Local run and deployment

Use Node.js 22, matching `package.json`.

```sh
git clone https://github.com/rehan85r/Walmo.git
cd Walmo
npm ci
npx vercel link
npx vercel env pull .env.local
npx vercel dev
```

Link your own Vercel project and configure its variables before pulling them.
A static file server alone cannot run the API. Authentication uses Secure cookies;
use an HTTPS preview if local browser cookie rules prevent sign-in.

Import the repo into Vercel as a static/Other project with Node functions in `/api`.
No frontend compilation is needed. Configure variables and Google origins, then
deploy. Keep the existing Vercel project and secrets when updating a live copy.

## Before vs after memory

1. Before supplying a preference, ask which dessert you prefer. Walmo should say
   it does not know.
2. Tell it: "My favourite dessert is Gulab Jamun. Please remember it."
3. Allow time for saving/indexing, open a new chat in the same account, and ask
   again without repeating the answer.
4. Inspect the actual recalled memory and reply. Capture real screenshots; an
   answer in the same conversation is not cross-conversation memory evidence.
5. Test a different Google account to check separation. Report retrieval failures
   rather than claiming every save or recall succeeds.

## Limits

Rate limiting is per process; shared production limits need a shared store.
Secret detection is heuristic: do not submit private keys or recovery phrases.
Web results depend on accessible sources and are not background monitoring.
Recall may be incomplete or outdated and is not proof of verified mainnet blob
counts. No automated test suite is included; use the manual checks above and
inspect deployment/function errors when needed.
