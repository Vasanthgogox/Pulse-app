import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getIdentityDb, isIdentityDbConfigured } from '@/lib/supabase';
import { buildPlatformSignInUrl } from '@/lib/suite-auth';

type AuthUser = {
  id: string;
  email?: string;
};

type AuthContextValue = {
  loading: boolean;
  user: AuthUser | null;
  authRequired: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const authRequired = isIdentityDbConfigured();
  const [loading, setLoading] = useState(authRequired);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const db = getIdentityDb();
    if (!db) {
      setLoading(false);
      return;
    }

    let mounted = true;
    void db.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const sessionUser = data.session?.user;
      setUser(sessionUser ? { id: sessionUser.id, email: sessionUser.email } : null);
      setLoading(false);
    });

    const { data: subscription } = db.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user;
      setUser(sessionUser ? { id: sessionUser.id, email: sessionUser.email } : null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const db = getIdentityDb();
    if (!db) return;
    await db.auth.signOut();
    window.location.assign(buildPlatformSignInUrl('/oms/dashboard'));
  }, []);

  const value = useMemo(
    () => ({ loading, user, authRequired, signOut }),
    [loading, user, authRequired, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
