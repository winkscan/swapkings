# SwapKings mobile (CLOCK IN hackathon build)

Native Android client for SwapKings, built on the official
`@solana-mobile/solana-mobile-expo-template` (Expo 52, RN 0.76, Mobile Wallet
Adapter). Mainnet only. Shares the on-chain program and Jupiter/fee logic with
the web app (`../app`), reimplements the wallet + UI layers for mobile.

## What's wired so far

- **`src/swapkings/`** — the ported business layer:
  - `jupiter.ts`, `pdas.ts`, `tokenProgram.ts`, `signature.ts`, `walletErrors.ts`,
    `confirmTx.ts`, `jupiterInfo.ts` — copied verbatim from `../app/src`.
  - `cacheWorker.ts`, `config.ts` — `import.meta.env` replaced with constants
    (`CACHE_WORKER_URL`, `RPC_ENDPOINT` = the SwapKings cache Worker `/rpc`).
  - `anchorClient.ts` — `Program` built with a non-signing provider (only reads
    accounts / builds the `record_swap` ix; never signs).
  - `playerStats.ts` — takes a `PublicKey` instead of an AnchorWallet.
  - `swapExecutor.ts` — same quote → build v0 tx (Jupiter route + `record_swap`)
    → simulate → retry-on-too-large logic, but the final step is
    `signAndSendTransaction(tx, minContextSlot)` from `useMobileWallet` inside an
    MWA `transact()` session instead of wallet-adapter's `sendTransaction`.
  - `gpaV2.ts`, `pumpfun.ts` — copied verbatim (getProgramAccountsV2 helper +
    Jupiter discovery / founder / market-cap lookup).
  - `useSwapkings.ts` — the swap hook: `quote()` + `swap()` (swap also waits
    for `confirmSignature`).
  - `txRunner.ts` — `useTxRunner()`: wrap instructions in a legacy Transaction,
    simulate, sign+send via MWA, confirm. Shared by guild + referral actions.
  - `useRank.ts` — LUCK tier / discount / progress, off this wallet's
    PlayerStats (wallet-adapter → useAuthorization).
  - `useAllTimeVolume.ts` — platform lifetime volume, cache-first + gpaV2
    fallback.
  - `useGuilds.ts` — Houses list: Jupiter discovery ∪ on-chain Guild accounts,
    cache-first, mcap backfill, optimistic member-count delta.
  - `guildActions.ts` — `buildJoinGuildIxs` / `buildLeaveGuildIx` (build-only;
    the screen runs them through `useTxRunner`). Ed25519 founder attestation
    kept for new-House creation.
  - `referral.ts` — `resolveReferralCode`, `claimReferralCode` (collision-retry
    loop via `useTxRunner`), `referralLink`, `usePendingReferralCode`
    (AsyncStorage instead of URL `?ref=` + localStorage),
    `resolvePendingReferrer` (SwapScreen passes it as `referrerArg`).
  - `format.ts` — pure display/number helpers.
- **Screens** (bottom tabs: Swap · Rank · Houses · Referral):
  - `SwapScreen.tsx` — preset tokens + custom mint, debounced auto-quote,
    connect/swap, Solscan link, LUCK/House result; passes a saved referral code
    as `referrerArg`.
  - `RankScreen.tsx` — tier badge, discount %, lifetime volume, progress bar to
    next tier, full tier table, platform volume.
  - `HousesScreen.tsx` — current-House banner + Leave, FlatList of Houses
    (symbol / MC / members / fees), Join/Switch gated on the
    $100k market-cap floor.
  - `ReferralScreen.tsx` — your link (claim if none) + Share/Copy, your
    referrer if set, "save a friend's code" field.
- **Scaffold changes**: `useAuthorization` chain → `solana:mainnet`,
  `APP_IDENTITY` → SwapKings; `cluster-data-access` default cluster → mainnet
  pointed at the cache Worker RPC; `app.json` name/slug/package → SwapKings;
  `HomeNavigator` rebuilt for the 4 SwapKings tabs.

## Verified in this environment (no device)

- `npx tsc --noEmit` — clean (all 24 ported files type-checked).
- `npx expo-doctor` — 18/18.
- `npx expo export --platform android` — **Metro bundles clean, 1290 modules,
  4.6 MB Hermes bytecode**. So every import resolves (Anchor, web3.js,
  spl-token, bs58, the IDL, the ported layer) and the polyfills wire up.
- Dependency tree deduped: single `@solana/web3.js@1.99.0`, single `bn.js`.

Still needs a real device / emulator: Anchor coder init under Hermes at
runtime, and the MWA `transact()` connect + sign-and-send round trip.

### Extra deps added on top of the scaffold

- `@coral-xyz/anchor@^0.32.1`, `bs58@^6`, `js-base64` — for the ported layer.
- `expo-asset`, `expo-font`, `expo-file-system`, `expo-keep-awake` — the
  scaffold's `npm install` left these out even though `expo` declares them;
  Metro needs them. Installed via `npx expo install`.

## Run it (needs a real Android setup — can't be done in CI/WSL here)

```
cd mobile
npx expo start --dev-client        # or: npm run android
```

MWA needs a **custom dev client**, not Expo Go. Build one:

```
npm install -g eas-cli
eas login                          # free expo.dev account
eas build --profile development --platform android   # cloud build -> APK
# or locally if Android SDK installed:
npm run build:local
```

Install the dev-client APK + a MWA wallet (Phantom / Solflare / fakewallet) on
the device/emulator, then `npx expo start --dev-client` and open from the app.

## Known follow-ups

- `APP_IDENTITY.icon` points at `favicon.ico` relative to `https://swapkings.app`
  — confirm that resolves, or drop it.
- Swap-side token search (`jupiterInfo.searchTokens`) instead of the preset
  buttons; onboarding screen; a proper "your swaps" history.
- Replace template `assets/*` icons/splash with SwapKings branding before the
  demo video.
- Start committing to `mobile/.git` and push to a public GitHub repo early —
  the hackathon judges "technical depth based on GitHub commits", so a real
  commit history over the build window matters.
- Deep-link handler for `swapkings://…?ref=<code>` so a shared referral link
  opens the app and auto-saves the code (today it's a manual paste in
  ReferralScreen).
