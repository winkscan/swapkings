import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Solana web3.js and its dependencies (incl. @solana/spl-token) expect Node
    // globals like Buffer/process to exist — this polyfills them properly for
    // every dependency, not just our own source files.
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
})
