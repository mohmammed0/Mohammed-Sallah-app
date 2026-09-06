import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localeNativeNames, translate } from '@sallah/i18n';
import { LocaleProvider } from '../src/providers/locale-provider';

const backend = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
}));
const alert = vi.hoisted(() => vi.fn());

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Alert: { alert },
  I18nManager: { allowRTL: vi.fn() },
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  Switch: 'Switch',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) },
}));
vi.mock('expo-router', () => ({ router: { replace: vi.fn(), push: vi.fn() } }));
vi.mock('@/components/ui', async () => import('../src/components/ui'));
vi.mock('@/design-system/primitives', async () => import('../src/design-system/primitives'));
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock('@/design-system/rtl', async () => import('../src/design-system/rtl'));
vi.mock('@/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('../src/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('@/providers/locale-provider', async () => import('../src/providers/locale-provider'));
vi.mock('@/providers/session-provider', () => ({
  useSessionContext: () => ({
    context: {
      authenticated: true,
      allowed: true,
      roles: ['customer'],
      activeRole: 'customer',
    },
    setActiveRole: vi.fn(),
    signOutAll: vi.fn(),
  }),
}));
vi.mock('@/features/auth/route-policy', async () => import('../src/features/auth/route-policy'));
vi.mock('@/features/location/location-provider', () => ({
  useCustomerLocation: () => ({ activeLocation: null }),
}));
vi.mock('@/features/notifications/expo-push-runtime', () => ({ revokeExpoPushDevice: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'account-owner' } }, error: null }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: backend.read,
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: (column: string, value: string) => ({
          then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) =>
            backend.update(table, values, column, value).then(resolve, reject),
          select: () => ({ single: () => backend.update(table, values, column, value) }),
        }),
      }),
    }),
    functions: { invoke: backend.invoke },
    rpc: backend.rpc,
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const renderers: ReactTestRenderer[] = [];

async function renderAccount() {
  const { default: Account } = await import('../app/account');
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      <LocaleProvider>
        <Account />
      </LocaleProvider>,
    );
  });
  renderers.push(renderer!);
  return renderer!;
}

function action(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find(
    (node) =>
      node.type === 'Pressable' &&
      node.findAllByType('Text').some((text) => text.children.includes(label)),
  );
}

function confirmDeletion() {
  const buttons = alert.mock.lastCall?.[2] as
    Array<{ style?: string; onPress?: () => void }> | undefined;
  const confirmation = buttons?.find((button) => button.style === 'destructive');
  expect(buttons?.some((button) => button.style === 'cancel')).toBe(true);
  expect(confirmation?.onPress).toBeTypeOf('function');
  confirmation?.onPress?.();
}

describe('account preferences and privacy controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backend.read.mockResolvedValue({
      data: { in_app: true, push: true, email: true, marketing: false },
      error: null,
    });
    backend.update.mockImplementation(async (_table, values) => ({
      data: { in_app: true, push: true, email: true, marketing: false, ...values },
      error: null,
    }));
    backend.rpc.mockResolvedValue({ data: {}, error: null });
    backend.invoke.mockResolvedValue({ data: { verified: true }, error: null });
  });

  afterEach(async () => {
    await act(() => renderers.splice(0).forEach((renderer) => renderer.unmount()));
  });

  it('selects languages by native name, announces the checked option, and updates direction', async () => {
    const renderer = await renderAccount();
    const choices = renderer.root.findAll(
      (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio',
    );
    expect(choices.map((choice) => choice.props.accessibilityLabel)).toEqual([
      localeNativeNames.ar,
      localeNativeNames.en,
      localeNativeNames.ur,
      localeNativeNames.hi,
    ]);
    expect(choices[0]?.props.accessibilityState.checked).toBe(true);
    expect(JSON.stringify(renderer.root.findByType('TextInput').props.style)).toContain(
      '"writingDirection":"rtl"',
    );

    await act(async () => {
      choices[1]?.props.onPress();
    });

    expect(choices[0]?.props.accessibilityState.checked).toBe(false);
    expect(choices[1]?.props.accessibilityState.checked).toBe(true);
    expect(JSON.stringify(renderer.root.findByType('TextInput').props.style)).toContain(
      '"writingDirection":"ltr"',
    );
    expect(backend.update).toHaveBeenCalledWith(
      'profiles',
      { preferred_locale: 'en' },
      'id',
      'account-owner',
    );
  });

  it('requires deletion confirmation and a current password before sending a privacy command', async () => {
    const renderer = await renderAccount();
    await act(async () => {
      action(renderer, translate('ar', 'startAccountDeletion')).props.onPress();
    });
    expect(backend.invoke).not.toHaveBeenCalled();

    await act(async () => confirmDeletion());

    expect(backend.invoke).not.toHaveBeenCalled();
    expect(backend.rpc).not.toHaveBeenCalledWith('request_account_deletion');
    expect(JSON.stringify(renderer.toJSON())).toContain(translate('ar', 'reauthPasswordRequired'));
  });

  it('waits for successful reauthentication before deletion and clears the entered password', async () => {
    let resolveVerification: ((result: { error: null }) => void) | undefined;
    backend.invoke.mockReturnValue(
      new Promise<{ error: null }>((resolve) => {
        resolveVerification = resolve;
      }),
    );
    const renderer = await renderAccount();
    await act(async () => {
      renderer.root.findByType('TextInput').props.onChangeText('private-test-password');
    });
    await act(async () =>
      action(renderer, translate('ar', 'startAccountDeletion')).props.onPress(),
    );
    expect(backend.invoke).not.toHaveBeenCalled();

    await act(async () => confirmDeletion());
    expect(backend.invoke).toHaveBeenCalledWith('reauthenticate', {
      body: { method: 'password', password: 'private-test-password' },
    });
    expect(backend.rpc).not.toHaveBeenCalledWith('request_account_deletion');

    await act(async () => resolveVerification?.({ error: null }));
    expect(backend.rpc).toHaveBeenCalledWith('request_account_deletion');
    expect(renderer.root.findByType('TextInput').props.value).toBe('');
    expect(
      backend.rpc.mock.calls.filter(([name]) => name === 'get_account_deletion_summary'),
    ).toHaveLength(2);
  });

  it('keeps export blocked when reauthentication fails', async () => {
    backend.invoke.mockResolvedValue({ data: null, error: { message: 'Invalid password' } });
    const renderer = await renderAccount();
    await act(async () => {
      renderer.root.findByType('TextInput').props.onChangeText('invalid-test-password');
    });
    await act(async () => action(renderer, translate('ar', 'requestDataExport')).props.onPress());

    expect(backend.rpc).not.toHaveBeenCalledWith('request_data_export');
    expect(renderer.root.findByType('TextInput').props.value).toBe('');
    expect(JSON.stringify(renderer.toJSON())).toContain(translate('ar', 'reauthFailed'));
  });

  it('persists independent notification changes without reverting another field when responses arrive in reverse order', async () => {
    const persisted = { in_app: true, push: true, email: true, marketing: false };
    const finish: Array<() => void> = [];
    backend.update.mockImplementation(
      (_table, values) =>
        new Promise((resolve) => {
          finish.push(() => {
            Object.assign(persisted, values);
            resolve({ data: { ...persisted }, error: null });
          });
        }),
    );
    const renderer = await renderAccount();
    const switches = () => renderer.root.findAllByType('Switch');
    await act(async () => switches()[1]?.props.onValueChange(false));
    await act(async () => switches()[2]?.props.onValueChange(false));
    await act(async () => finish[1]?.());
    await act(async () => finish[0]?.());
    expect(persisted).toMatchObject({ push: false, email: false });
    expect(switches().map((control) => control.props.value)).toEqual([true, false, false, false]);
    expect(backend.update.mock.calls.map((call) => call[1])).toEqual([
      { push: false },
      { email: false },
    ]);
  });

  it('prevents another write to the same notification while its first save is pending', async () => {
    let finish!: (value: unknown) => void;
    backend.update.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const renderer = await renderAccount();
    await act(async () => renderer.root.findAllByType('Switch')[1]?.props.onValueChange(false));
    expect(renderer.root.findAllByType('Switch')[1]?.props.disabled).toBe(true);
    await act(async () => renderer.root.findAllByType('Switch')[1]?.props.onValueChange(true));
    expect(backend.update).toHaveBeenCalledTimes(1);
    await act(async () =>
      finish({ data: { in_app: true, push: false, email: true, marketing: false }, error: null }),
    );
    expect(renderer.root.findAllByType('Switch')[1]?.props.disabled).toBe(false);
  });

  it('rolls back only a failed notification field and leaves another successful choice visible', async () => {
    backend.update.mockImplementation(async (_table, values) =>
      values.push !== undefined
        ? { data: null, error: new Error('SYNTHETIC_SAVE_FAILURE') }
        : { data: { in_app: true, push: true, email: false, marketing: false }, error: null },
    );
    const renderer = await renderAccount();
    await act(async () => renderer.root.findAllByType('Switch')[2]?.props.onValueChange(false));
    await act(async () => renderer.root.findAllByType('Switch')[1]?.props.onValueChange(false));
    expect(renderer.root.findAllByType('Switch').map((control) => control.props.value)).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(JSON.stringify(renderer.toJSON())).toContain(translate('ar', 'notificationSaveFailed'));
  });

  it('keeps notification edits disabled until the stored preferences have loaded', async () => {
    let finish!: (value: unknown) => void;
    backend.read.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const renderer = await renderAccount();
    expect(renderer.root.findAllByType('Switch').every((control) => control.props.disabled)).toBe(
      true,
    );
    await act(async () => renderer.root.findAllByType('Switch')[1]?.props.onValueChange(false));
    expect(backend.update).not.toHaveBeenCalled();
    await act(async () =>
      finish({ data: { in_app: true, push: false, email: false, marketing: false }, error: null }),
    );
    expect(renderer.root.findAllByType('Switch').every((control) => !control.props.disabled)).toBe(
      true,
    );
    expect(renderer.root.findAllByType('Switch')[1]?.props.value).toBe(false);
  });

  it('allows retry after a failed preference read and refuses an unconfirmed save', async () => {
    backend.read.mockResolvedValueOnce({ data: null, error: new Error('SYNTHETIC_READ_FAILURE') });
    const renderer = await renderAccount();
    expect(renderer.root.findAllByType('Switch').every((control) => control.props.disabled)).toBe(
      true,
    );
    await act(async () => action(renderer, translate('ar', 'retry')).props.onPress());
    backend.update.mockResolvedValueOnce({ data: null, error: null });
    await act(async () => renderer.root.findAllByType('Switch')[1]?.props.onValueChange(false));
    expect(renderer.root.findAllByType('Switch')[1]?.props.value).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).toContain(translate('ar', 'notificationSaveFailed'));
  });
});
