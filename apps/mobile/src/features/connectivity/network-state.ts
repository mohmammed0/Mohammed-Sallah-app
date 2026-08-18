import type { NetworkState } from 'expo-network';

export function isNetworkOnline(state: NetworkState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}
