# Web3 tutor upgrade

- Added optional validated Web3 topic classification and secret-gated, sanitized `remember` calls after replies.
- Added tutor instructions: simple steps, analogy, check question, and memory-based recap/quiz without invented mastery.
- Added `/api/progress` with shared namespace logic, timeout, no-store, origin checks, rate limits and real-topic filtering/deduplication.
- Added mobile home cards, starter chips, real remembered-topic list, and asynchronous progress refresh.
- Replaced memory counts with an expandable “Recalled from memory” chip showing returned memory texts; preserved that evidence in new local/cloud Recents.
- Corrected the landing subtitle; retained existing orb, colors, login, attachment and chat controls.
- Pinned published server dependencies, added package-lock.json, names-only .env.example, .gitignore, and reproducible setup/architecture documentation.
- Added eight mocked backend tests. All passed when executed directly; all inline scripts parse. Mobile browser checks passed for starter sends, chip expansion, refreshed cards and overflow (mocked APIs and wallet SDK, no page errors).

## Deliberate limits

- Google memory remains account-scoped; Slush-only memory remains browser-session-scoped, matching the original backend. Wallet signature authentication was not invented.
- Progress is up to 20 semantic recall results, ordered by actual timestamps when available. It cannot guarantee a globally newest topic or complete history. No fake recency or completion label is shown.
- MemWal saving/indexing is asynchronous. The UI refreshes immediately and after 15 seconds; later indexing may require another New Chat/refresh.
- Existing OpenRouter tool options are unchanged and were not live-verified. No new SDK options were invented; recall, analyze and remember match the installed MemWal API.
- Live Google/Slush, provider tools and mainnet persistence require a real preview smoke test with your credentials. This package has not been deployed.
