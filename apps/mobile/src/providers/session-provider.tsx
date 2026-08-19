import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { z } from 'zod';
import { parseKnownUserRoles, userRoleSchema } from '@sallah/domain';
import { supabase } from '@/lib/supabase';
import { clearLocalAuthStorage, isSecureStorageError } from '@/lib/secure-storage';
import { parseAuthLinkParams } from '@/features/auth/auth-link';
import {
  LatestSerialExecutor,
  type LocalSessionStatus,
  reportSessionBootstrapError,
  runBoundedOperation,
  runSessionBootstrap,
  SESSION_BOOTSTRAP_TIMEOUT_MS,
  type SessionBootstrapOutcome,
  type StartupErrorCategory,
} from './session-bootstrap';

const roleSchema = userRoleSchema;
export type SessionRole = z.infer<typeof roleSchema>;
const rawSessionContextSchema = z.object({
  authenticated: z.boolean(),
  allowed: z.boolean().default(false),
  userId: z.string().uuid().optional(),
  accountStatus: z.string().optional(),
  locale: z.enum(['ar', 'en', 'ur', 'hi']).optional(),
  roles: z.array(z.string()).default([]),
  activeRole: z.string().nullable().optional(),
  requestedRole: z.string().nullable().optional(),
  providerVerificationStatus: z.string().nullable().optional(),
  blockedReason: z.string().nullable().optional(),
});
export interface SessionContext extends Omit<
  z.infer<typeof rawSessionContextSchema>,
  'roles' | 'activeRole' | 'requestedRole'
> {
  roles: SessionRole[];
  activeRole?: SessionRole | null;
  requestedRole?: SessionRole | null;
}
function parseSessionContext(value: unknown): SessionContext {
  const raw = rawSessionContextSchema.parse(value);
  const parsed = parseKnownUserRoles(raw.roles);
  const active = raw.activeRole ? roleSchema.safeParse(raw.activeRole) : null;
  const requested = raw.requestedRole ? roleSchema.safeParse(raw.requestedRole) : null;
  return {
    ...raw,
    roles: parsed.roles,
    activeRole: active?.success ? active.data : null,
    requestedRole: requested?.success ? requested.data : null,
    allowed: parsed.unknownRoles.length ? false : raw.allowed,
    blockedReason: parsed.unknownRoles.length ? 'UNSUPPORTED_ROLE_CONTRACT' : raw.blockedReason,
  };
}
type Rpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

interface SessionState {
  loading: boolean;
  session: Session | null;
  context: SessionContext | null;
  authLinkError: string | null;
  startupError: StartupErrorCategory | null;
  localSessionStatus: LocalSessionStatus;
  refresh: () => Promise<void>;
  clearLocalSession: () => Promise<void>;
  setActiveRole: (role: SessionRole) => Promise<void>;
  signOutAll: () => Promise<void>;
}

const Context = createContext<SessionState | null>(null);

async function handleAuthLink(url: string): Promise<void> {
  const parsed = Linking.parse(url);
  const payload = parseAuthLinkParams(parsed.queryParams);
  if (payload.kind === 'pkce') {
    const { error } = await supabase.auth.exchangeCodeForSession(payload.code);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.auth.setSession({
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
  });
  if (error) throw error;
}

function blockedContext(category: StartupErrorCategory): SessionContext {
  return {
    authenticated: true,
    allowed: false,
    roles: [],
    activeRole: null,
    blockedReason:
      category === 'malformed_session_context'
        ? 'SESSION_CONTEXT_INVALID'
        : 'SESSION_CONTEXT_UNAVAILABLE',
  };
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [context, setContext] = useState<SessionContext | null>(null);
  const [authLinkError, setAuthLinkError] = useState<string | null>(null);
  const [startupError, setStartupError] = useState<StartupErrorCategory | null>(null);
  const [localSessionStatus, setLocalSessionStatus] = useState<LocalSessionStatus>('unknown');
  const mountedRef = useRef(true);
  const executorRef = useRef<LatestSerialExecutor | null>(null);
  const executor = executorRef.current ?? (executorRef.current = new LatestSerialExecutor());

  const applyBootstrapOutcome = useCallback(
    (outcome: SessionBootstrapOutcome<Session, SessionContext>) => {
      setLocalSessionStatus(outcome.localSessionStatus);
      if (outcome.status === 'unauthenticated') {
        setSession(null);
        setContext(null);
        setStartupError(null);
        return;
      }
      if (outcome.status === 'authenticated') {
        setSession(outcome.session);
        setContext(outcome.context);
        setStartupError(null);
        return;
      }

      if (outcome.localSessionStatus === 'present' && outcome.session) {
        setSession(outcome.session);
        setContext(blockedContext(outcome.category));
      }
      setStartupError(outcome.category);
      reportSessionBootstrapError(outcome.category);
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true);
      setStartupError(null);
    }

    await executor.enqueue(async ({ isLatest }) => {
      try {
        const outcome = await runSessionBootstrap<Session, SessionContext>({
          getSession: async () => {
            const result = await supabase.auth.getSession();
            return {
              data: { session: result.data.session },
              error: result.error,
            };
          },
          getSessionContext: () => (supabase.rpc as unknown as Rpc)('get_session_context'),
          parseContext: parseSessionContext,
          isStorageError: isSecureStorageError,
          timeoutMs: SESSION_BOOTSTRAP_TIMEOUT_MS,
        });
        if (mountedRef.current && isLatest()) applyBootstrapOutcome(outcome);
      } catch {
        if (mountedRef.current && isLatest()) {
          setStartupError('startup_unavailable');
          setLocalSessionStatus('unknown');
          reportSessionBootstrapError('startup_unavailable');
        }
      } finally {
        if (mountedRef.current && isLatest()) setLoading(false);
      }
    });
  }, [applyBootstrapOutcome, executor]);

  const clearLocalSession = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true);
      setStartupError(null);
    }

    await executor.enqueue(async ({ isLatest }) => {
      try {
        const result = await runBoundedOperation(async () => {
          if (Platform.OS !== 'web') {
            const clearedKeyCount = await clearLocalAuthStorage();
            if (clearedKeyCount === 0) throw new Error('LOCAL_AUTH_STORAGE_NOT_IDENTIFIED');
          }
          const signOut = await supabase.auth.signOut({ scope: 'local' });
          if (signOut.error) throw new Error('LOCAL_SIGN_OUT_FAILED');
        }, SESSION_BOOTSTRAP_TIMEOUT_MS);

        if (result.timedOut) throw new Error('LOCAL_SESSION_CLEAR_TIMEOUT');
        if (mountedRef.current && isLatest()) {
          setSession(null);
          setContext(null);
          setStartupError(null);
          setLocalSessionStatus('cleared');
        }
      } catch {
        if (mountedRef.current && isLatest()) {
          setStartupError('local_clear_failed');
          setLocalSessionStatus('unknown');
          reportSessionBootstrapError('local_clear_failed');
        }
      } finally {
        if (mountedRef.current && isLatest()) setLoading(false);
      }
    });
  }, [executor]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const auth = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    const processLink = async (url: string) => {
      try {
        await handleAuthLink(url);
        setAuthLinkError(null);
        await refresh();
      } catch {
        setAuthLinkError('INVALID_OR_EXPIRED_AUTH_LINK');
      }
    };
    const link = Linking.addEventListener('url', ({ url }) => {
      void processLink(url);
    });
    void Linking.getInitialURL().then(async (url) => {
      if (!url) return;
      await processLink(url);
    });
    return () => {
      mountedRef.current = false;
      executor.invalidate();
      auth.data.subscription.unsubscribe();
      link.remove();
    };
  }, [executor, refresh]);

  const setActiveRole = useCallback(async (role: SessionRole) => {
    const response = await (supabase.rpc as unknown as Rpc)('set_active_role', { p_role: role });
    if (response.error) throw new Error(response.error.message);
    setContext(parseSessionContext(response.data));
  }, []);

  const signOutAll = useCallback(async () => {
    const result = await supabase.auth.signOut({ scope: 'global' });
    if (result.error) throw new Error('SIGN_OUT_FAILED');
    setSession(null);
    setContext(null);
    setStartupError(null);
    setLocalSessionStatus('absent');
  }, []);

  const value = useMemo(
    () => ({
      loading,
      session,
      context,
      authLinkError,
      startupError,
      localSessionStatus,
      refresh,
      clearLocalSession,
      setActiveRole,
      signOutAll,
    }),
    [
      loading,
      session,
      context,
      authLinkError,
      startupError,
      localSessionStatus,
      refresh,
      clearLocalSession,
      setActiveRole,
      signOutAll,
    ],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSessionContext(): SessionState {
  const value = useContext(Context);
  if (!value) throw new Error('SessionProvider is required');
  return value;
}
