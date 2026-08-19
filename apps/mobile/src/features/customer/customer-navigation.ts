import type { AppIconName } from '@/design-system/icon';

export const customerTabs = [
  { route: 'customer-home', labelKey: 'home', icon: 'home' },
  { route: 'customer-requests', labelKey: 'requests', icon: 'requests' },
  { route: 'customer-messages', labelKey: 'messages', icon: 'messages' },
  { route: 'customer-account', labelKey: 'account', icon: 'customer' },
] as const satisfies ReadonlyArray<{
  route: string;
  labelKey: 'home' | 'requests' | 'messages' | 'account';
  icon: AppIconName;
}>;
