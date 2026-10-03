# Walmo — Keep up with your crypto projects

Walmo is a personal crypto-project update tracker with a Web3 chat assistant. Follow a project, select its public announcement sources, and tap **Check updates**. The first successful check creates a baseline. Later checks compare readable source text with the previous snapshot and recall the corresponding checkpoint from Walrus Memory when available.

The dashboard shows source-backed AI summaries, explicit tasks, verbatim deadline text, last successful check time, and user-marked Done/Skip status. No fabricated streaks, completion scores or demo projects are displayed.

Live app: https://walmo.vercel.app
Repo: https://github.com/rehan85r/Walmo

## What changed from the tutor

The tutor starter chips, lesson cards, topic classifier, learning-log writes and forced check questions are removed. Existing historical tutor logs are excluded from ordinary chat recall. `/api/progress` returns HTTP 410 for stale clients. Old on-chain memories and chat histories are not erased: this SDK integration does not implement a supported deletion operation. Normal Google/Slush UI, chat, attachments, reply preferences/languages, secret detection, rate limits and existing OpenRouter web tools remain.

## Use it

1. Open **My Projects** on the home screen or in the menu.
2. Enter the project name and up to three public HTTPS announcement, blog, documentation changelog or RSS/Atom URLs. Confirm that you checked these sources belong to the project.
3. Tap **Check updates** to create a baseline. Baseline tasks are not labelled newly announced.
4. Return later and check again. Every item links to a fetched source and an exact supporting excerpt. Any deadline is copied as published, not assigned an invented year or timezone.
5. Mark tasks **Done**, **Skip**, or **Reopen**. These are your statuses, not independently verified on-chain completion.

Checks are manual. There are no notifications, scheduled checks, wallet transactions or automatic task execution. The fetcher reads only selected pages; it does not crawl the entire site or discover every announcement. Private Discord/Telegram, login-only X pages, JavaScript-only sites and bot-protected pages may be unreadable. Choose a public announcement/feed source instead. A task remaining pending does not mean it is still open or that you qualify.

## Before vs after memory

Before the first check, Walmo has no project baseline and cannot claim that an item is new since your visit. After checking, it stores a timestamped checkpoint. On a later check it calls MemWal recall for the previous check ID in that project's namespace. Only a returned record matching both the project ID and check ID is accepted as memory evidence. The previous summary and recorded task context can then inform the comparison with current source text.

Expand **Previous checkpoint recalled from Walrus Memory** to see the actual earlier summary and timestamp used. The badge is shown only after that matching record is retrieved. If recall fails or indexing has not completed, Walmo compares exact Redis source snapshots and explicitly labels that fallback; it does not pretend memory was recalled.

For a real demo: use an official page/feed that actually changes, capture the first baseline, return after a real announcement, and show the remembered checkpoint, source excerpt and new item. Do not manufacture changes or present mocked browser-test screenshots as real project activity.

## Architecture

- `index.html`: latest frontend master, existing chat/auth UI, home mounting point and My Projects menu entry.
- `project-tracker.js` / `.css`: dashboard, add-project form, source evidence, task controls, mobile panel. All content is inserted as text; links permit HTTPS only.
- `api/projects.js`: GET dashboard; POST `add`, `check`, `task`, `remove`. Shares chat's signed namespace and language logic. Limits projects to 10, sources to 3 each, retained items to 80/project, with pending tasks prioritized when trimming.
- `lib/project-sources.js`: public HTTPS fetching, DNS address validation/pinning, per-hop redirect checks, 10-second deadline, 1 MB body cap, readable text extraction (up to 40,000 characters/source). No browser cookies, authorization headers or private access tokens are sent to sources.
- `lib/project-analysis.js`: OpenRouter JSON extraction from current and previous fetched text. Rejects unsupported source URLs, invented quotes or deadline text absent from the source. Summaries remain AI interpretations; matching quotes do not guarantee every interpretation is correct.
- `lib/project-store.js`: Redis REST state and atomic per-user mutation lock. Snapshots, followed projects and mutable task status live here.
- `api/chat.js`: normal assistant preserved; tutor instructions/logging removed. Shared namespace, timeout, secret and limiter helpers are exported.
- `api/auth.js`, `google-auth.js`, `attachment-patch.js`, `api/recents.js`: existing auth, attachments and chat-history features retained.
- `api/progress.js`: retired tutor endpoint; returns 410.

### Walrus Memory / MemWal

Uses pinned `@mysten-incubation/memwal` with the mainnet relayer `https://relayer.memory.walrus.xyz`. No SDK methods or options were invented.

Project namespace: `<existing chat namespace>-project-<server generated UUID>`.

- `recall({ query: "Walmo project checkpoint v1 <previous-check-id>", limit: 10, maxDistance: 0.9 })` supplies the matching prior checkpoint if indexed and recalled.
- `remember(...)` stores a structured checkpoint containing project name, sources, check ID, timestamp, summary, and task statuses after a successful check.
- `waitForRememberJob(job.job_id)` confirms checkpoint job completion inside Vercel `waitUntil`, with a bounded timeout. An accepted/unconfirmed job is not labelled completed. The dashboard refreshes after 15 seconds; reopen My Projects if the job needs longer. A timeout does not cancel an already accepted remote job.
- Explicit user task status changes are also recorded with `remember(...)`. Redis remains authoritative for the current mutable status; the next checkpoint includes it.
- Normal chat retains recall before reply and `analyze(message)` afterward, with existing secret-detection skipping.

No `restore` call or remote-memory deletion is needed. Removing a followed project removes its Redis dashboard entry but does not erase previously stored Walrus records. A newly re-added project receives a new ID and namespace.

### Storage, identity and failure semantics

Google login uses the existing verified account-derived namespace. Slush connection remains available, but the existing backend does not verify wallet signatures for memory identity; Slush-only/guest users remain browser-session scoped. Connecting a wallet on another browser does not grant access to that browser's memories.

Redis source snapshots support precise comparison and avoid treating semantic recall as a complete event database. Redis is required for My Projects; its absence returns a clear configuration error. All selected sources must be readable for a successful check. Source or analysis failure leaves the previous successful baseline intact and reports an incomplete check. Unchanged readable text skips the model call and preserves tasks.

Task matching currently uses source URL plus normalized generated title. An upstream rewording or language change may produce a separate entry; inspect duplicates before marking them. Stored Done/Skip statuses are retained for matching entries. Source disappearance never silently marks a task completed or cancelled.

Rate limits are per-instance and best effort (60 requests/session/minute, 120/IP/minute, 6 checks/session/minute). Unknown IPs skip the IP bucket. Each project has a 30-second gap between successful checks. Use a shared limiter for global production enforcement. Redis mutation locks prevent concurrent check/status writes from overwriting one another.

## Required configuration

Use Node.js 22.x. Server dependencies and transitive versions are pinned in `package.json` and `package-lock.json`. Existing wallet browser imports retain their original esm.sh URLs.

Create `.env.local` using `NAME=value` entries. `.env.example` intentionally lists variable names only. Never commit real secrets.

Required for chat and tracker:

- `SESSION_SECRET`: existing secret, at least 32 characters. **Do not rotate it during this migration**: it signs cookies and derives existing namespaces/storage keys.
- `MEMWAL_PRIVATE_KEY`: authorized MemWal delegate key.
- `MEMWAL_ACCOUNT_ID`: authorized mainnet relayer account.
- `OPENROUTER_API_KEY`.
- One Redis pair: `KV_REST_API_URL` + `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`. Reuse the existing cloud-Recents Redis integration.

For Google sign-in: `GOOGLE_CLIENT_ID`. Keep production/preview origins in Google's authorized JavaScript origins. This existing ID-token flow does not use a Google client secret.

Optional: `OPENROUTER_MODEL` (defaults to `google/gemini-2.5-flash`). Vercel supplies `VERCEL`/`NODE_ENV`. No new paid search API or background job service is required for this manual source-check version.

## Local run and deploy

```sh
npm ci
npm test
npx vercel link
npx vercel env pull .env.local
npx vercel dev
```

A static file server alone does not run the Node API. Existing Google cookies are Secure; use an authorized HTTPS preview if local auth cookies are rejected.

Upload/merge this package at the repository root, keeping `api`, `lib` and `tests` as folders. Deploy through your existing GitHub/Vercel integration, or `npx vercel` for a preview and `npx vercel --prod` after verification. `vercel.json` configures 60-second durations for chat and projects. No framework build command/output folder is needed for this static frontend plus functions setup.

See `MIGRATION.md` for the exact upload list. Do not upload `node_modules` or real `.env` files. This package does not itself change the deployed site or production environment variables.

## Verification

`npm test` runs mocked backend tests for source validation, public-IP protection, evidence validation, baseline and changed checks, real-checkpoint matching, task status persistence, blocked pages, memory outages, Google namespace isolation, origin protection, ordinary chat preservation and tutor retirement. No test uses real credentials or writes mainnet data.

Mobile UI checks use mocked providers to exercise add/check/task controls, source excerpts, reload persistence, My Projects panel, error states and normal chat. Real Google/Slush, Redis credentials, OpenRouter quality and mainnet writes must still be smoke-tested on your deployment. For hackathon evidence, use the real app over multiple days and update the article to describe this tracker instead of the retired tutor.
