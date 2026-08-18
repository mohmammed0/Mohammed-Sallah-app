import { describe, expect, it } from 'vitest';
import { canEnterProductArea, productLandingRoute } from '../src/features/auth/route-policy';

describe('mobile protected route policy', () => {
  it('routes an active customer into customer tabs only', () => {
    const context = { allowed: true, roles: ['customer'], activeRole: 'customer' };
    expect(productLandingRoute(context)).toBe('/customer-home');
    expect(canEnterProductArea(context, 'customer')).toBe(true);
    expect(canEnterProductArea(context, 'provider-operations')).toBe(false);
  });

  it('treats a revoked provider role as absent from the server-filtered role set', () => {
    const context = { allowed: true, roles: ['customer'], activeRole: 'provider' };
    expect(productLandingRoute(context)).toBe('/account');
    expect(canEnterProductArea(context, 'provider-onboarding')).toBe(false);
  });

  it('allows onboarding but blocks operations until provider verification completes', () => {
    const context = {
      allowed: true,
      roles: ['customer', 'provider'],
      activeRole: 'provider',
      providerVerificationStatus: 'under_review',
    };
    expect(productLandingRoute(context)).toBe('/provider/onboarding');
    expect(canEnterProductArea(context, 'provider-onboarding')).toBe(true);
    expect(canEnterProductArea(context, 'provider-operations')).toBe(false);
    expect(
      canEnterProductArea(
        { ...context, providerVerificationStatus: 'verified' },
        'provider-operations',
      ),
    ).toBe(true);
  });

  it('keeps restricted account states outside every product area', () => {
    const context = { allowed: false, roles: ['customer', 'provider'], activeRole: 'customer' };
    expect(productLandingRoute(context)).toBe('/account');
    expect(canEnterProductArea(context, 'customer')).toBe(false);
    expect(canEnterProductArea(context, 'provider-operations')).toBe(false);
  });
});
