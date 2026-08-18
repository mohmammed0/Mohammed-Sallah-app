import { describe, expect, it } from 'vitest';
import { isNetworkOnline } from '../src/features/connectivity/network-state';

describe('native connectivity state', () => {
  it('fails closed when the device or internet is reported unreachable', () => {
    expect(isNetworkOnline({ isConnected: false, isInternetReachable: false })).toBe(false);
    expect(isNetworkOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
    expect(isNetworkOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
  });
});
