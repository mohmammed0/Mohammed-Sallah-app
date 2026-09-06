import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const acquireForegroundLocation = vi.hoisted(() => vi.fn());
const openSettings = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Linking: { openSettings },
  ScrollView: 'ScrollView',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}));
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }));
vi.mock('@sallah/i18n', () => ({ formatStatusLabel: (status: string) => status }));
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQuery: () => ({ data: null, isSuccess: true, isPending: false, refetch: vi.fn() }),
}));
vi.mock('react-hook-form', () => ({
  Controller: () => null,
  useForm: () => ({
    clearErrors: vi.fn(),
    control: {},
    formState: { errors: {} },
    handleSubmit: vi.fn(),
    reset: vi.fn(),
    setError: vi.fn(),
  }),
}));
vi.mock('@/components/ui', () => ({
  Button: 'Button',
  Card: 'Card',
  LoadingSkeleton: 'LoadingSkeleton',
  Screen: 'Screen',
  styles: {},
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/secure-upload', () => ({ secureUpload: vi.fn() }));
vi.mock('@/lib/mutation-journal', () => ({ executeJournaledMutation: vi.fn() }));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({ locale: 'ar', t: (key: string) => key }),
}));
vi.mock('@/providers/session-provider', () => ({
  useSessionContext: () => ({ session: { user: { id: '11111111-1111-4111-8111-111111111111' } } }),
}));
vi.mock(
  '@/features/provider/onboarding-draft',
  async () => import('../src/features/provider/onboarding-draft'),
);
vi.mock('@/features/location/location-device', () => ({
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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

async function renderOnboarding() {
  const { default: ProviderOnboarding } = await import('../app/provider/onboarding');
  let renderer: ReturnType<typeof create> | undefined;
  await act(async () => {
    renderer = create(<ProviderOnboarding />);
  });
  return renderer!;
}

function findLocationButton(renderer: ReturnType<typeof create>) {
  return renderer.root.find(
    (node) =>
      node.type === 'Button' &&
      ['selectServiceCenter', 'serviceCenterSelected', 'openDeviceSettings'].includes(
        node.props.label as string,
      ),
  );
}

describe('provider onboarding foreground-location recovery', () => {
  beforeEach(() => {
    acquireForegroundLocation.mockReset();
    openSettings.mockClear();
  });

  it('explains that the service center uses foreground location only', async () => {
    const renderer = await renderOnboarding();
    const messages = renderer.root
      .findAllByType('Text')
      .flatMap((node) => node.children)
      .filter((child): child is string => typeof child === 'string');

    expect(messages).toContain('providerLocationRequired');
  });

  it('uses the latest foreground candidate as the service-area center', async () => {
    acquireForegroundLocation.mockImplementation(async (onCandidate) => {
      await onCandidate({
        coordinates: { latitude: 24.7, longitude: 46.6 },
        source: 'last_known',
      });
      await onCandidate({
        coordinates: { latitude: 24.7136, longitude: 46.6753 },
        source: 'accurate',
      });
      return { status: 'accurate' };
    });
    const renderer = await renderOnboarding();

    await act(async () => {
      await findLocationButton(renderer).props.onPress();
    });

    expect(findLocationButton(renderer).props.label).toBe('serviceCenterSelected');
  });

  it('routes a permanent denial to device Settings before retrying', async () => {
    acquireForegroundLocation.mockResolvedValue({ status: 'denied_settings' });
    const renderer = await renderOnboarding();

    await act(async () => {
      await findLocationButton(renderer).props.onPress();
    });
    expect(findLocationButton(renderer).props.label).toBe('openDeviceSettings');

    await act(async () => {
      await findLocationButton(renderer).props.onPress();
    });
    expect(openSettings).toHaveBeenCalledOnce();
  });
});
