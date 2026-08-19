import { describe, expect, it } from 'vitest';
import { customerTabs } from '../src/features/customer/customer-navigation';

describe('customer navigation contract', () => {
  it('shows exactly the four approved customer destinations', () => {
    expect(customerTabs.map((tab) => tab.route)).toEqual([
      'customer-home',
      'customer-requests',
      'customer-messages',
      'customer-account',
    ]);
    expect(customerTabs.some((tab) => tab.route.includes('jobs'))).toBe(false);
  });

  it('gives every destination a maintained icon contract', () => {
    expect(new Set(customerTabs.map((tab) => tab.icon)).size).toBe(customerTabs.length);
  });
});
