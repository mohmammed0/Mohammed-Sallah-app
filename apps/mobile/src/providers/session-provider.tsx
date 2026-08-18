import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import { z } from 'zod';
import { parseKnownUserRoles, userRoleSchema } from '@sallah/domain';
import { supabase } from '@/lib/supabase';
import { parseAuthLinkParams } from '@/features/auth/auth-link';

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
  refresh: () => Promise<void>;
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

export function SessionProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [context, setContext] = useState<SessionContext | null>(null);
  const [authLinkError, setAuthLinkError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const result = await supabase.auth.getSession();
    const nextSession = result.data.session;
    setSession(nextSession);
    if (!nextSession) {
      setContext(null);
      setLoading(false);
      return;
    }
    const response = await (supabase.rpc as unknown as Rpc)('get_session_context');
    if (response.error) {
      setContext({
        authenticated: true,
        allowed: false,
        roles: [],
        activeRole: null,
        blockedReason: 'SESSION_CONTEXT_UNAVAILABLE',
      });
    } else {
      setContext(parseSessionContext(response.data));
    }
    setLoading(false);
  }, []);
  useEffect(() => {
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
      auth.data.subscription.unsubscribe();
      link.remove();
    };
  }, [refresh]);
  const setActiveRole = useCallback(async (role: SessionRole) => {
    const response = await (supabase.rpc as unknown as Rpc)('set_active_role', { p_role: role });
    if (response.error) throw new Error(response.error.message);
    setContext(parseSessionContext(response.data));
  }, []);
  const signOutAll = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'global' });
    setSession(null);
    setContext(null);
  }, []);
  const value = useMemo(
    () => ({ loading, session, context, authLinkError, refresh, setActiveRole, signOutAll }),
    [loading, session, context, authLinkError, refresh, setActiveRole, signOutAll],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSessionContext(): SessionState {
  const value = useContext(Context);
  if (!value) throw new Error('SessionProvider is required');
  return value;
}
