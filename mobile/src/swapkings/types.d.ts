// @ungap/structured-clone ships no types. It's only used in src/polyfills.ts
// to fill in Hermes's missing global structuredClone.
declare module "@ungap/structured-clone" {
  export default function structuredClone<T>(value: T, options?: { lossy?: boolean; json?: boolean }): T;
}
