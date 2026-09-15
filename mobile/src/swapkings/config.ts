// Web build reads these from Vite's `import.meta.env` (see app/.env.local).
// React Native has no such thing; the values are the same on every device, so
// they live here as plain constants. If a mainnet RPC ever needs to differ per
// build, promote these to `expo-constants` (app.json `extra`) — for now inline
// is simplest and matches how the on-chain program constants are already
// mirrored across the codebase.

// SwapKings' own Cloudflare cache Worker. `/rpc` is its Helius proxy (plain
// HTTP, no WebSocket — see confirmTx.ts for why confirmation is polled), the
// bare origin serves the guild list / all-time volume / fee history datasets
// and the `/jup/*` Jupiter proxy (keeps the Jupiter key server-side).
export const CACHE_WORKER_URL = 'https://swapkings-cache.swapkings.workers.dev'
export const RPC_ENDPOINT = `${CACHE_WORKER_URL}/rpc`
export const CLUSTER = 'mainnet-beta' as const
