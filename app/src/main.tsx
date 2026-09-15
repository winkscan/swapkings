import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-adapter-mobile'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@solana/wallet-adapter-react-ui/styles.css'
import './index.css'
import App from './App.tsx'

// Defaults to the local validator during dev. Set VITE_RPC_ENDPOINT in
// app/.env.local (see .env.example) to point at a real devnet/mainnet RPC
// provider (Helius/QuickNode/Triton — the public mainnet RPC can't handle real
// traffic) without touching code. VITE_CLUSTER controls which cluster the Mobile
// Wallet Adapter (Seeker) reports itself as talking to — must match RPC_ENDPOINT's
// actual network or wallets will sign against the wrong chain.
const RPC_ENDPOINT = import.meta.env.VITE_RPC_ENDPOINT || 'http://127.0.0.1:8899'
const MWA_CLUSTER =
  (import.meta.env.VITE_CLUSTER as WalletAdapterNetwork | undefined) ?? WalletAdapterNetwork.Devnet

function Root() {
  const wallets = useMemo(
    () => [
      new SolanaMobileWalletAdapter({
        addressSelector: createDefaultAddressSelector(),
        appIdentity: {
          name: 'SwapKings',
          uri: window.location.origin,
        },
        authorizationResultCache: createDefaultAuthorizationResultCache(),
        cluster: MWA_CLUSTER,
        onWalletNotFound: createDefaultWalletNotFoundHandler(),
      }),
    ],
    [],
  )

  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
