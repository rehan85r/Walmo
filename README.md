# Walmo — a Web3 tutor that remembers

Walmo explains Web3 concepts with simple steps, an everyday analogy, and a short check question. Walrus Memory lets it retrieve a learner's earlier questions across new conversations and offer a recap or quiz. The home screen shows saved topics, never fabricated lesson counts, streaks, or mastery scores.

Live app: https://walmo.vercel.app
Repository: https://github.com/rehan85r/Walmo

## Before vs after memory

1. Sign in with Google (or use the same browser session) and start a new chat.
2. Ask: “Teach me about gas fees. I prefer short explanations with one everyday example.”
3. Answer the check question. A lesson being suggested or a topic being saved does not establish mastery.
4. Allow the asynchronous save to finish. Start a new chat. The home screen should show the saved topic once recall can retrieve it.
5. Tap “Continue with gas fees.” Walmo can use the retrieved topic to acknowledge that you asked about it before and offer a recap or quiz.
6. Expand “Recalled from memory” to inspect the actual texts supplied to the model. The chip indicates retrieval, not proof that every record influenced the answer.

Before a successful save and retrieval, there is no prior-topic evidence and Walmo gives a standalone lesson. Afterward, it has evidence of the earlier question. Capture both states from real use for the article, including the new-chat boundary; do not substitute mocked test screenshots or claim days of use without evidence.

## Architecture

- `index.html`: existing mobile-first static interface, Slush wallet connection, attachments, language/preferences controls, local chat history, tutor cards and expandable memory evidence.
- `google-auth.js`: Google Identity Services UI; `api/auth.js` verifies the Google ID token and issues a signed HttpOnly session cookie.
- `api/chat.js`: validation and rate limits; classification of language/time/learning topic; memory recall; OpenRouter reply with existing web tools; deferred memory saving.
- `api/progress.js`: read-only recall in the **same namespace** as chat. Returns `{ success: true, topics: [...] }`.
- `api/recents.js`: existing Google-account chat-history sync via Redis. Chat history and Walrus Memory are separate.
- `attachment-patch.js`: existing attachment handling.

### Memory lifecycle on mainnet

The server creates MemWal with its delegate key, account ID, namespace and `https://relayer.memory.walrus.xyz`.

1. Before replying, `recall({ query: message, limit: 5, maxDistance: 0.8 })` retrieves `results[].text`. Recall failure falls back to a normal reply without memories.
2. Retrieved texts enter the prompt as untrusted user context, never instructions or verified public documentation.
3. After a successful reply, `analyze(message)` is deferred to extract useful facts.
4. If classification identified a Web3 learning topic, `remember("Web3 learning log: the user asked to learn about <topic>.")` is also deferred. Topic text is sanitized and capped at 60 characters. Secret-like messages skip both saves.
5. Progress uses `recall({ query: "Web3 learning log", limit: 20, maxDistance: 0.9 })`, filters the explicit log format and deduplicates topics case-insensitively. Real `created_at` timestamps order the retrieved records when available. Without timestamps, recall order is retained. This is a bounded semantic result set, **not a complete chronological learning history**; the UI says “Continue learning,” not “your latest lesson.”

MemWal accepts asynchronous jobs; acceptance does not prove completed mainnet storage or indexing. The UI refreshes progress after a reply and again after 15 seconds, and on New Chat. Longer indexing delays may need another refresh. No optimistic or fabricated topic is inserted. Retrieval outages show “Learning progress unavailable,” not an empty first-lesson state. The app does not currently poll `waitForRememberJob` or call `restore`; no unsupported methods or options were introduced.

### Identity and existing limitations

Google users retain the existing HMAC-derived `walmo-google-*` namespace. Other users retain the signed browser-session `walmo-v2-*` namespace. Slush connection remains available, but this backend does **not** verify wallet signatures or derive a durable wallet-owned namespace. Connecting the same wallet on another browser does not establish access to the same memories. This update deliberately preserves that behavior; wallet-authenticated memory is a separate future change.

Do not rotate `SESSION_SECRET` casually: it signs cookies and derives namespaces and history keys. Rotation changes access to existing records. New responses retain their recalled texts in local and cloud Recents so the chip can be restored. Older chats without recorded memory texts do not invent missing evidence.

## Requirements and environment

Use Node.js 22.x and npm. Direct server dependencies are pinned and `package-lock.json` locks transitive dependencies. Existing wallet browser imports still use their original esm.sh URLs; their upstream delivery is not locked by npm.

`.env.example` contains names only, as requested. Create `.env.local` yourself using `NAME=value` lines; never commit credentials.

Required:

- `SESSION_SECRET`: cryptographically random string, at least 32 characters. Keep the existing production value.
- `MEMWAL_PRIVATE_KEY`: authorized MemWal Ed25519 delegate key.
- `MEMWAL_ACCOUNT_ID`: account authorized for that delegate on the mainnet relayer.
- `OPENROUTER_API_KEY`: server-side API key.
- `GOOGLE_CLIENT_ID`: Google OAuth web client ID, used by existing Google sign-in.

Optional:

- `OPENROUTER_MODEL`: defaults to `google/gemini-2.5-flash`.
- `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: configure one pair to preserve cloud Recents. Local history can exist without it, but cloud backup needs Redis.

Vercel supplies `VERCEL` and `NODE_ENV`; do not copy credentials into the HTML. Google OAuth authorized JavaScript origins must include your production origin and your local testing origin. The current auth uses a Google ID token, not an OAuth client secret. Slush connection has no additional backend secret in this version.

## Local development

```sh
npm ci
npm test
npx vercel link
npx vercel env pull .env.local
npx vercel dev
```

Or create `.env.local` with the variables above before running `vercel dev`. Open the URL printed by Vercel. A static file server alone does not run `/api` handlers. Google auth cookies are Secure in the existing implementation; if a local browser rejects them, test auth over an HTTPS preview deployment with the authorized Google origin.

The tests use injected fake providers, never real keys or mainnet writes. They cover topic saves, malformed classification, failed recall/save, secret skipping, public IDs, progress filtering, Google namespace isolation, origin checks, and rate limits.

## Vercel deployment

1. Replace/add the files from this upgrade at repository root, preserving other existing files.
2. Install with `npm ci`; keep the lockfile committed. Use Node.js 22.x in Vercel project settings. This is a static site with Node functions; no framework build output is required.
3. Configure the required environment variables for the intended deployment environments. Preserve the existing session secret and MemWal credentials.
4. `vercel.json` sets 60 seconds for `api/chat.js` and `api/progress.js`. For plain `/api` functions this is the reliable configuration; exports are retained too.
5. Deploy a preview using `npx vercel`, verify Google/Slush, attachments, language switching and the real memory flow, then use `npx vercel --prod` or your GitHub deployment workflow.

Chat has a shared 45-second reply deadline and a 58-second work deadline. Classifier/recall/main ceilings remain 12/5/38 seconds, bounded by the shared deadline; saves have a 12-second ceiling. Both saves run concurrently under the same deadline. SDK timeout wrappers do not cancel a job already accepted remotely.

Rate limiting is best-effort in-memory per function instance (20/session and 60/IP per minute). Unknown IPs skip the IP bucket; each endpoint still limits the session. Production-wide enforcement needs a shared atomic store such as Upstash Redis. Secret detection is heuristic, not a guarantee; do not submit real seed phrases or keys during tests.

## Release verification

Automated tests are mocked. A successful test run does not verify live Google authentication, Slush authorization, OpenRouter tool availability, or mainnet writes. Before submitting, run the real before/after flow above and record genuine usage over the required period. The article should explain both how memory changes the lesson and these limits.
