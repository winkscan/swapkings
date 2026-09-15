import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { RPC_ENDPOINT } from "../../swapkings/config";

export interface Cluster {
  name: string;
  endpoint: string;
  network: ClusterNetwork;
  active?: boolean;
}

export enum ClusterNetwork {
  Mainnet = "mainnet-beta",
  Testnet = "testnet",
  Devnet = "devnet",
  Custom = "custom",
}
export function toWalletAdapterNetwork(
  cluster?: ClusterNetwork
): WalletAdapterNetwork | undefined {
  switch (cluster) {
    case ClusterNetwork.Mainnet:
      return WalletAdapterNetwork.Mainnet;
    case ClusterNetwork.Testnet:
      return WalletAdapterNetwork.Testnet;
    case ClusterNetwork.Devnet:
      return WalletAdapterNetwork.Devnet;
    default:
      return undefined;
  }
}

// SwapKings is mainnet-only, full stop: its program/PDAs only exist on
// mainnet, and useAuthorization's MWA chain identifier is hardcoded to
// `solana:mainnet`. devnet/testnet were removed here after a real bug: the
// scaffold's own cluster-picker-feature.tsx compares
// `RadioButton.Group value={selectedCluster.network}` (an enum value like
// "mainnet-beta") against each row's `RadioButton value={cluster.name}` (a
// plain string like "mainnet") — those only happened to be equal for
// devnet/testnet by coincidence (ClusterNetwork.Devnet === "devnet" ===
// name). Adding a real mainnet entry exposed the mismatch (no radio ever
// shows selected), and — worse — clusternetworkToIndex() only knows
// "devnet"/"testnet" and throws "Invalid cluster selected" for anything
// else, so actually tapping the mainnet row would have crashed the app.
// Confirmed live on-device, 2026-09-11. Simplest correct fix for a
// single-network app: there is nothing to switch to, so don't offer a
// switcher — see SettingsScreen.tsx's own comment.
export const defaultClusters: Readonly<Cluster[]> = [
  {
    name: "mainnet",
    endpoint: RPC_ENDPOINT,
    network: ClusterNetwork.Mainnet,
  },
];

export interface ClusterProviderContext {
  selectedCluster: Cluster;
  clusters: Cluster[];
  setSelectedCluster: (cluster: Cluster) => void;
  getExplorerUrl(path: string): string;
}

const Context = createContext<ClusterProviderContext>(
  {} as ClusterProviderContext
);

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [selectedCluster, setSelectedCluster] = useState<Cluster>(
    defaultClusters[0]
  );
  const clusters = [...defaultClusters];

  const value: ClusterProviderContext = useMemo(
    () => ({
      selectedCluster,
      clusters: clusters.sort((a, b) => (a.name > b.name ? 1 : -1)),
      setSelectedCluster: (cluster: Cluster) => setSelectedCluster(cluster),
      getExplorerUrl: (path: string) =>
        `https://explorer.solana.com/${path}${getClusterUrlParam(
          selectedCluster
        )}`,
    }),
    [selectedCluster, setSelectedCluster]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCluster() {
  return useContext(Context);
}

function getClusterUrlParam(cluster: Cluster): string {
  let suffix = "";
  switch (cluster.network) {
    case ClusterNetwork.Devnet:
      suffix = "devnet";
      break;
    case ClusterNetwork.Mainnet:
      suffix = "";
      break;
    case ClusterNetwork.Testnet:
      suffix = "testnet";
      break;
    default:
      suffix = `custom&customUrl=${encodeURIComponent(cluster.endpoint)}`;
      break;
  }

  return suffix.length ? `?cluster=${suffix}` : "";
}
