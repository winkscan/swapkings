import { getRandomValues as expoCryptoGetRandomValues } from "expo-crypto";
import { Buffer } from "buffer";
import structuredClonePolyfill from "@ungap/structured-clone";

global.Buffer = Buffer;

// Hermes (React Native's JS engine, through RN 0.76) has no structuredClone;
// @solana/web3.js 1.99 calls it while cloning RPC responses, so a swap threw
// "Property 'structuredClone' doesn't exist" on device. The @ungap polyfill
// is a serialize/deserialize round-trip, which is all web3.js needs here
// (plain JSON-ish response objects).
if (typeof (global as any).structuredClone === "undefined") {
  (global as any).structuredClone = (value: unknown) =>
    structuredClonePolyfill(value, { lossy: false });
}

// getRandomValues polyfill
class Crypto {
  getRandomValues = expoCryptoGetRandomValues;
}

const webCrypto = typeof crypto !== "undefined" ? crypto : new Crypto();

(() => {
  if (typeof crypto === "undefined") {
    Object.defineProperty(window, "crypto", {
      configurable: true,
      enumerable: true,
      get: () => webCrypto,
    });
  }
})();
