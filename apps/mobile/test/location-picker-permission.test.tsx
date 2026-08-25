import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const acquireForegroundLocation = vi.hoisted(() => vi.fn());
const openSettings = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Linking: { openSettings },
  StyleSheet: {
    absoluteFill: {},
    create: (styles: Record<string, unknown>) => styles,
  },
  Switch: 'Switch',
  Text: 'Text',
  View: 'View',
}));
vi.mock('react-native-maps', () => ({ default: 'MapView' }));
vi.mock('expo-location', () => ({ reverseGeocodeAsync: vi.fn(async () => []) }));
vi.mock('@/design-system/customer-components', () => ({
  AddressCard: 'AddressCard',
  AppHeader: 'AppHeader',
  AppScreen: 'AppScreen',
  FormField: 'FormField',
  GhostButton: 'GhostButton',
  LocationPermissionCard: 'LocationPermissionCard',
  MapPin: 'MapPin',
  PrimaryButton: 'PrimaryButton',
  SecondaryButton: 'SecondaryButton',
  Toast: 'Toast',
}));
vi.mock('@/design-system/primitives', () => ({
  SectionHeader: 'SectionHeader',
  customerStyles: { body: {}, caption: {} },
}));
vi.mock('@/design-system/tokens', () => ({
  customerTokens: {
    colors: { border: '#000', sand: '#fff', white: '#fff' },
    radius: { lg: 16 },
    spacing: { lg: 24, md: 16, sm: 8 },
  },
}));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'ar', dir: 'rtl', t: (key: string) => key }),
}));
vi.mock('../src/features/location/location-device', () => ({
  acquireForegroundLocation,
  locationRecoveryForResult: ({ status }: { status: string }) => {
    if (status === 'denied_settings') {
      return { action: 'settings', messageKey: 'locationPermissionDenied' };
    }
    if (status === 'denied_retryable') {
      return { action: 'retry', messageKey: 'locationPermissionDenied' };
    }
    if (status === 'last_known_only') {
      return { action: null, messageKey: 'locationUsingRecentFix' };
    }
    if (status === 'unavailable') {
      return { action: null, messageKey: 'locationUnavailable' };
    }
    return { action: null, messageKey: null };
  },
}));
vi.mock('../src/features/location/location-service', () => ({
  resolveServiceLocation: vi.fn(async () => ({
    status: 'supported',
    countryCode: 'SA',
    city: {
      id: '11111111-1111-4111-8111-111111111111',
      code: 'riyadh',
      nameAr: 'Riyadh',
      nameEn: 'Riyadh',
    },
  })),
}));
vi.mock('../src/features/location/map-readiness', () => ({
  isCustomerMapConfigured: () => false,
  MAP_RENDER_TIMEOUT_MS: 5_000,
  REVERSE_GEOCODE_DEBOUNCE_MS: 550,
}));

const locationState = {
  activeLocation: null,
  addresses: [],
  loading: false,
  loaded: true,
  error: false,
  selectSavedAddress: vi.fn(),
  selectTransientLocation: vi.fn(),
  clearTransientLocation: vi.fn(),
  saveAddress: vi.fn(),
  archiveAddress: vi.fn(),
  makeDefault: vi.fn(),
  refresh: vi.fn(),
};
vi.mock('../src/features/location/location-provider', () => ({
  useCustomerLocation: () => locationState,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

async function openLocationEditor() {
  const { LocationPicker } = await import('../src/features/location/location-picker');
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(<LocationPicker onDone={vi.fn()} />);
  });
  const add = renderer?.root.find(
    (node) => node.type === 'PrimaryButton' && node.props.label === 'addNewLocation',
  );
  await act(async () => {
    add?.props.onPress();
  });
  return renderer!;
}

describe('customer location permission recovery', () => {
  beforeEach(() => {
    acquireForegroundLocation.mockReset();
    openSettings.mockClear();
  });

  it('turns a permanent denial into a localized Settings action', async () => {
    acquireForegroundLocation.mockResolvedValue({ status: 'denied_settings' });
    const renderer = await openLocationEditor();
    let permissionCard = renderer.root.findByType('LocationPermissionCard');

    await act(async () => {
      permissionCard.props.onAction();
    });

    permissionCard = renderer.root.findByType('LocationPermissionCard');
    expect(permissionCard.props.actionLabel).toBe('openDeviceSettings');
    await act(async () => {
      permissionCard.props.onAction();
    });
    expect(openSettings).toHaveBeenCalledOnce();
  });

  it('keeps a recent fix visible and clearly asks the customer to verify the pin', async () => {
    acquireForegroundLocation.mockImplementation(async (onCandidate) => {
      await onCandidate({
        coordinates: { latitude: 24.7136, longitude: 46.6753 },
        source: 'last_known',
      });
      return { status: 'last_known_only' };
    });
    const renderer = await openLocationEditor();
    const permissionCard = renderer.root.findByType('LocationPermissionCard');

    await act(async () => {
      permissionCard.props.onAction();
    });

    const messages = renderer.root
      .findAllByType('Toast')
      .map((node) => node.props.message as string);
    expect(messages).toContain('locationUsingRecentFix');
  });
});
