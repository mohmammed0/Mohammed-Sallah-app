import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));
const localeState = vi.hoisted(() => ({ locale: 'ar', dir: 'rtl' }));

vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  Text: 'Text',
  View: 'View',
}));
vi.mock('expo-linking', () => ({ createURL: (path: string) => `sallah://${path}` }));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));
vi.mock('@/providers/locale-provider', () => ({
  useLocale: () => ({ ...localeState, t: (key: string) => key }),
}));
vi.mock('@/design-system/primitives', () => ({
  ActionButton: 'ActionButton',
  CustomerScreen: 'CustomerScreen',
  Field: 'Field',
  InteractivePressable: 'InteractivePressable',
  Notice: 'Notice',
  Surface: 'Surface',
  customerStyles: { display: {}, bodyMuted: {}, caption: {}, section: {} },
}));
vi.mock('@/design-system/icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('@/design-system/tokens', async () => import('../src/design-system/tokens'));
vi.mock('@/design-system/rtl', async () => import('../src/design-system/rtl'));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let renderer: ReactTestRenderer;
async function openAuth() {
  const Auth = (await import('../app/auth')).default;
  await act(() => {
    renderer = create(<Auth />);
  });
}
async function enter(label: string, value: string) {
  await act(() => {
    renderer.root.findByProps({ label }).props.onChangeText(value);
  });
}
async function press(label: string) {
  await act(async () => {
    renderer.root
      .findAllByType('ActionButton')
      .find((node) => node.props.label === label)!
      .props.onPress();
  });
}
async function chooseSignUp() {
  await act(() => {
    renderer.root
      .findByProps({ accessibilityRole: 'tab', accessibilityLabel: 'signUp' })
      .props.onPress();
  });
}
function noticeText() {
  return renderer.root.findAllByType('Notice').map((node) => node.props.children);
}

describe('authentication screen actions', () => {
  beforeEach(() => {
    localeState.locale = 'ar';
    localeState.dir = 'rtl';
    for (const method of Object.values(auth)) {
      method.mockReset().mockResolvedValue({ data: { user: null, session: null }, error: null });
    }
  });
  afterEach(async () => {
    if (renderer) await act(() => renderer.unmount());
  });

  it('switches account mode without sending credentials and presents one submit action', async () => {
    await openAuth();
    await chooseSignUp();
    expect(auth.signUp).not.toHaveBeenCalled();
    const primaryActions = renderer.root
      .findAllByType('ActionButton')
      .filter((node) => !node.props.variant || node.props.variant === 'primary');
    expect(primaryActions).toHaveLength(1);
    expect(primaryActions[0]?.props.label).toBe('signUp');
    expect(
      renderer.root.findByProps({ accessibilityRole: 'tab', accessibilityLabel: 'signUp' }).props
        .accessibilityState.selected,
    ).toBe(true);
  });

  it.each([
    ['', '', 'authEmailRequired'],
    ['not-an-email', 'valid-password', 'authEmailInvalid'],
    ['customer@example.com', '', 'authPasswordRequired'],
  ])(
    'validates sign-in fields before sending an auth request (%s)',
    async (email, password, error) => {
      await openAuth();
      await enter('email', email);
      await enter('password', password);
      await press('signIn');
      expect(noticeText()).toContain(error);
      expect(auth.signInWithPassword).not.toHaveBeenCalled();
    },
  );

  it('applies the signup password requirement without blocking existing shorter passwords', async () => {
    await openAuth();
    await enter('email', 'customer@example.com');
    await enter('password', 'short');
    await chooseSignUp();
    await press('signUp');
    expect(noticeText()).toContain('authPasswordTooShort');
    expect(auth.signUp).not.toHaveBeenCalled();
    await act(() => {
      renderer.root
        .findByProps({ accessibilityRole: 'tab', accessibilityLabel: 'signIn' })
        .props.onPress();
    });
    await press('signIn');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'customer@example.com',
      password: 'short',
    });
  });

  it('keeps only one request in flight even when the same submit handler runs twice', async () => {
    let resolve!: (value: { error: null }) => void;
    auth.signInWithPassword.mockImplementation(
      () => new Promise<{ error: null }>((complete) => (resolve = complete)),
    );
    await openAuth();
    await enter('email', ' customer@example.com ');
    await enter('password', 'valid-password');
    const submit = renderer.root.findByProps({ label: 'signIn' }).props.onPress;
    await act(async () => {
      submit();
      submit();
    });
    expect(auth.signInWithPassword).toHaveBeenCalledOnce();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'customer@example.com',
      password: 'valid-password',
    });
    expect(renderer.root.findByProps({ label: 'signIn' }).props.loading).toBe(true);
    await act(async () => resolve({ error: null }));
    expect(renderer.root.findByProps({ label: 'signIn' }).props.loading).toBe(false);
  });

  it('recovers from a rejected auth promise and allows a new attempt without exposing errors', async () => {
    auth.signInWithPassword.mockRejectedValueOnce(new Error('private provider diagnostic'));
    await openAuth();
    await enter('email', 'customer@example.com');
    await enter('password', 'valid-password');
    await press('signIn');
    expect(noticeText()).toContain('authFailed');
    expect(noticeText()).not.toContain('private provider diagnostic');
    expect(renderer.root.findByProps({ label: 'signIn' }).props.disabled).toBe(false);
    await press('signIn');
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(2);
  });

  it('uses the selected language on signup and then exposes verification recovery', async () => {
    localeState.locale = 'ur';
    await openAuth();
    await enter('email', ' customer@example.com ');
    await enter('password', 'valid-password');
    await chooseSignUp();
    expect(renderer.root.findAllByProps({ label: 'resendVerification' })).toHaveLength(0);
    await press('signUp');
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'customer@example.com',
      password: 'valid-password',
      options: {
        data: { preferred_locale: 'ur' },
        emailRedirectTo: 'sallah:///auth-callback',
      },
    });
    expect(noticeText()).toContain('verificationEmailSent');
    await press('resendVerification');
    expect(auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'customer@example.com',
      options: { emailRedirectTo: 'sallah:///auth-callback' },
    });
  });

  it('shows and hides the password without altering its value', async () => {
    await openAuth();
    await enter('password', 'unchanged-password');
    expect(renderer.root.findByProps({ label: 'password' }).props.secureTextEntry).toBe(true);
    await press('authShowPassword');
    expect(renderer.root.findByProps({ label: 'password' }).props.secureTextEntry).toBe(false);
    expect(renderer.root.findByProps({ label: 'password' }).props.value).toBe('unchanged-password');
    await press('authHidePassword');
    expect(renderer.root.findByProps({ label: 'password' }).props.secureTextEntry).toBe(true);
  });

  it('keeps server rejection safe and restores the submit action', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: 'invalid_credentials', message: 'internal provider detail' },
    });
    await openAuth();
    await enter('email', 'customer@example.com');
    await enter('password', 'valid-password');
    await press('signIn');
    expect(noticeText()).toEqual(['authFailed']);
    expect(renderer.root.findByProps({ label: 'signIn' }).props.disabled).toBe(false);
    expect(renderer.root.findAllByProps({ label: 'resendVerification' })).toHaveLength(0);
  });

  it('offers verification recovery for an unconfirmed email and hides it when the address changes', async () => {
    auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    });
    await openAuth();
    await enter('email', 'customer@example.com');
    await enter('password', 'valid-password');
    await press('signIn');
    expect(noticeText()).toContain('authVerificationRequired');
    expect(renderer.root.findAllByProps({ label: 'resendVerification' })).toHaveLength(1);
    await enter('email', 'another@example.com');
    expect(renderer.root.findAllByProps({ label: 'resendVerification' })).toHaveLength(0);
  });

  it('resets a password using only a valid email and preserves the recovery deep link', async () => {
    await openAuth();
    await enter('email', 'customer@example.com');
    await press('resetPassword');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('customer@example.com', {
      redirectTo: 'sallah:///auth-recovery',
    });
    expect(noticeText()).toContain('recoveryEmailSent');
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });
});
