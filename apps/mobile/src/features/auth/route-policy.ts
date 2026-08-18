export interface RoutableSessionContext {
  allowed: boolean;
  roles: readonly string[];
  activeRole?: string | null | undefined;
  providerVerificationStatus?: string | null | undefined;
}

export type ProductArea = 'customer' | 'provider-onboarding' | 'provider-operations';

export function canEnterProductArea(
  context: RoutableSessionContext | null,
  area: ProductArea,
): boolean {
  if (!context?.allowed) return false;
  if (area === 'customer') {
    return context.activeRole === 'customer' && context.roles.includes('customer');
  }
  if (context.activeRole !== 'provider' || !context.roles.includes('provider')) return false;
  return area === 'provider-onboarding' || context.providerVerificationStatus === 'verified';
}

export function productLandingRoute(context: RoutableSessionContext | null): string {
  if (!context?.allowed) return '/account';
  if (context.activeRole === 'provider' && context.roles.includes('provider')) {
    return context.providerVerificationStatus === 'verified'
      ? '/provider-home'
      : '/provider/onboarding';
  }
  if (context.activeRole === 'customer' && context.roles.includes('customer')) {
    return '/customer-home';
  }
  return '/account';
}
