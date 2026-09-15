# swapkings-cache

Cloudflare Worker that hits Helius ONCE every 2 minutes (cron trigger) for the
3 datasets that are identical for every visitor — guild list, all-time swap
volume, guild fee history — caches the result in KV, and serves it to the
frontend over plain HTTP. Turns Helius cost for this data from
O(concurrent users) into O(1). See `src/index.ts` for the full reasoning and
`project memory` (2026-08-21 Helius audit) for the numbers that motivated it.

Per-wallet data (a connected wallet's own RANK/friends) is NOT cached here —
that's different per user and stays as direct, already-throttled RPC calls
from the frontend (see `useRank.ts`/`useFriends.ts`).

## One-time setup (run these yourself — needs your own Cloudflare login)

```bash
cd cloudflare-worker
npx wrangler login
```

Opens a browser tab for Cloudflare OAuth — nothing typed into this terminal,
no token pasted anywhere.

```bash
npx wrangler kv namespace create CACHE_KV
```

Prints an `id = "..."` — paste that into `wrangler.toml`'s
`REPLACE_WITH_KV_NAMESPACE_ID` placeholder.

```bash
npx wrangler secret put HELIUS_API_KEY
```

Prompts for the value interactively (paste the same Helius API key already
used in `app/.env.local` / the deploy scripts) — stored encrypted on
Cloudflare's side, never written to any file in this repo.

## Deploy

```bash
npx wrangler deploy
```

Prints the Worker's live URL (`https://swapkings-cache.<your-subdomain>.workers.dev`).
The cron trigger starts firing immediately on Cloudflare's side — no need to
keep this terminal open. First request to any route 503s with "cache warming
up" until the first cron tick completes (up to 2 minutes) — expected, not a
bug.

**After every redeploy, also run:**
```bash
npx wrangler triggers deploy
```
Real bug hit live 2026-08-22: plain `wrangler deploy` (wrangler 4.125.0) does
not reliably re-register the Cron Trigger on a code-only redeploy — the
Worker kept serving its stale first-ever cached snapshot indefinitely, with
zero cron activity in `wrangler tail`, until this command was run explicitly.
Cheap and idempotent, so just always run it after `wrangler deploy` — don't
assume a successful deploy means the schedule survived it. (Confirming this
yourself needs `wrangler tail` left open across a real scheduled tick — a
window under ~30s is too short to be sure either way.)

Set that URL as `VITE_CACHE_WORKER_URL` in `app/.env.local` to switch the
frontend over to it.

## Useful commands

```bash
npx wrangler tail
```
Live log stream — watch cron ticks and requests as they happen.

```bash
npx wrangler deploy
```
Redeploy after editing `src/index.ts` (e.g. if `state.rs`'s account layouts
ever change — keep the byte offsets in `src/index.ts` in sync).

## Routes

- `GET /guilds` → `{ updatedAt, guilds: GuildRow[] }`
- `GET /all-time-volume` → `{ updatedAt, volumeUsd: number }`
- `GET /guild-fees` → `{ updatedAt, rows: GuildFeeRow[] }`
