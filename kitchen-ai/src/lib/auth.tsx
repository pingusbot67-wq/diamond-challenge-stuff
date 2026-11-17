import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { isConfigured, supabase } from './supabase';
import type { Profile } from './types';

type Ctx = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({ ready: false, session: null, profile: null, refreshProfile: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!isConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) return setProfile(null);
    let { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
    if (!data) ({ data } = await supabase.from('profiles').upsert({ id: s.user.id }).select('*').single()); // safety net
    setProfile((data as Profile) ?? null);
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session).catch(() => {});
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Supabase advises not to await other calls inside this callback
      setTimeout(() => loadProfile(s).catch(() => {}), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value: Ctx = {
    ready,
    session,
    profile,
    refreshProfile: () => loadProfile(session),
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
