import { PublicKey } from '@solana/web3.js'

// Manual, dependency-free Borsh decode for this program's two most
// safety-critical accounts — PlayerStats and Guild, read on every swap to
// decide who actually gets paid. Bypasses @coral-xyz/anchor's coder
// entirely.
//
// Why: a real crash was confirmed live on an Android device (Hermes),
// `fetchPlayerStats failed: TypeError: undefined is not a function`, 6+
// stack frames deep inside buffer-layout's Blob/WrappedLayout decode chain
// (the library @coral-xyz/borsh uses under the hood) — and the SAME fetch,
// against the SAME account bytes, decoded perfectly fine in plain Node
// (confirmed with a throwaway script hitting the real RPC). Root cause,
// after a real investigation (downloaded the actual deployed Hermes
// bytecode from EAS's CDN and disassembled it — no source-mapped
// symbolication available for a production build in this session): the
// `buffer` npm package (RN's Buffer polyfill, set as `global.Buffer` in
// polyfills.ts) does NOT use real `class Buffer extends Uint8Array` — it
// fakes the prototype chain via `Object.setPrototypeOf(Buffer, Uint8Array)`
// instead. `.slice()`/`.subarray()` on a TypedArray construct their result
// via `SpeciesConstructor` (`this.constructor[Symbol.species]`), and V8
// happens to still resolve that back to `Buffer` through the faked chain —
// but this FIRST version of this very file's own `decodePlayerStats` called
// `data.subarray(0, 8).equals(...)`, and on-device that threw the exact
// same "undefined is not a function", one frame, no nested helper call
// (matching this file's own decodePlayerStats calling it inline) — i.e.
// Hermes's subarray() handed back a bare Uint8Array with no `.equals`.
// Verified in Node that the SAME buffer-polyfill Buffer's `.subarray()`
// keeps its Buffer-ness there, so this genuinely doesn't reproduce off-
// device; the fix is just to never rely on a `.slice()`/`.subarray()`
// result having Buffer-only methods, on any engine. 2026-09-11.
//
// PlayerStats/Guild are simple fixed-size structs (see the program's own
// state.rs / the built IDL's `types` section) — reading them by hand with
// explicit byte offsets is the same convention pdas.ts's own
// PLAYER_STATS_REFERRER_OFFSET already documents for exactly this struct.

// #[account] discriminators — first 8 bytes of every account, taken from the
// built IDL's own `accounts[].discriminator` (Anchor's sha256("account:Name")
// truncated to 8 bytes). Mirrored here rather than re-derived at runtime.
const PLAYER_STATS_DISCRIMINATOR = [169, 146, 242, 176, 102, 118, 231, 172]
const GUILD_DISCRIMINATOR = [74, 176, 57, 164, 195, 188, 156, 237]
const REFERRAL_CODE_DISCRIMINATOR = [227, 239, 247, 224, 128, 187, 44, 229]

// Plain indexed comparison — deliberately NOT `.subarray(...).equals(...)`
// (see this file's own top comment for the real crash that caused).
// Indexed access (`data[i]`) is fundamental TypedArray behavior, unaffected
// by whatever a `.slice()`/`.subarray()` call's own result type turns out
// to be on a given engine.
function matchesDiscriminator(data: Buffer, discriminator: number[]): boolean {
  for (let i = 0; i < discriminator.length; i++) {
    if (data[i] !== discriminator[i]) return false
  }
  return true
}

function readU64LE(data: Buffer, offset: number): number {
  // Called on `data` itself (never on a .slice()/.subarray() result) — see
  // this file's own top comment. Every u64 this app actually reads (USD
  // cents, member counts) is far below Number.MAX_SAFE_INTEGER in real
  // usage — readBigUInt64LE (exact) then Number() is simpler than BN here.
  return Number(data.readBigUInt64LE(offset))
}

function readPubkey(data: Buffer, offset: number): PublicKey {
  // PublicKey's constructor only ever indexes/copies its input — it never
  // calls a Buffer-only method on it, so a bare Uint8Array here (whatever
  // .subarray() actually returned) is fine either way.
  return new PublicKey(data.subarray(offset, offset + 32))
}

export interface RawPlayerStats {
  depositor: PublicKey
  cumulativeVolumeCents: number
  currentGuild: PublicKey
  currentGuildFounderWallet: PublicKey
  referrer: PublicKey
  myReferralCode: number[]
}

// Offsets from the start of the account (discriminator included) — verified
// against the built IDL's PlayerStats type: discriminator(8) depositor(32)
// cumulative_volume_cents(8) current_guild(32)
// current_guild_founder_wallet(32) referrer(32) my_referral_code([u8;7])
// bump(1) earned_for_referrer_usd_e4(8).
export function decodePlayerStats(data: Buffer): RawPlayerStats {
  if (!matchesDiscriminator(data, PLAYER_STATS_DISCRIMINATOR)) {
    throw new Error('decodePlayerStats: discriminator mismatch — not a PlayerStats account')
  }
  return {
    depositor: readPubkey(data, 8),
    cumulativeVolumeCents: readU64LE(data, 40),
    currentGuild: readPubkey(data, 48),
    currentGuildFounderWallet: readPubkey(data, 80),
    referrer: readPubkey(data, 112),
    myReferralCode: Array.from(data.subarray(144, 151)),
  }
}

export interface RawGuild {
  tokenMint: PublicKey
  founderWallet: PublicKey
  memberCount: number
  totalFeesEarnedUsdE4: number
}

// discriminator(8) token_mint(32) founder_wallet(32) member_count(8)
// total_fees_earned_usd_e4(8) bump(1).
export function decodeGuild(data: Buffer): RawGuild {
  if (!matchesDiscriminator(data, GUILD_DISCRIMINATOR)) {
    throw new Error('decodeGuild: discriminator mismatch — not a Guild account')
  }
  return {
    tokenMint: readPubkey(data, 8),
    founderWallet: readPubkey(data, 40),
    memberCount: readU64LE(data, 72),
    totalFeesEarnedUsdE4: readU64LE(data, 80),
  }
}

// discriminator(8) owner(32) bump(1). Used by referral.ts's
// resolveReferralCode — same Anchor-coder crash risk as PlayerStats/Guild,
// fixed the same way.
export function decodeReferralCode(data: Buffer): { owner: PublicKey } {
  if (!matchesDiscriminator(data, REFERRAL_CODE_DISCRIMINATOR)) {
    throw new Error('decodeReferralCode: discriminator mismatch — not a ReferralCode account')
  }
  return { owner: readPubkey(data, 8) }
}
