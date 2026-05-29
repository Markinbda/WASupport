import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile, UserRole } from './types';

type AuthCtx = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  isAdmin: boolean;
  isManager: boolean; // admin or manager
  isStaff: boolean;   // any non-submitter
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error?: string }>;
  signInWithMicrosoft: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

const STAFF_ROLES: UserRole[] = [
  'it_tech',
  'fac_tech',
  'hs_officer',
  'support',
  'manager',
  'admin',
  'leadership',
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setProfile(null);
      return;
    }
    let active = true;
    supabase
      .from('profiles')
      .select('id, email, full_name, role, department, created_at')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setProfile((data as Profile) ?? null);
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const refreshProfile = async () => {
    if (!supabase || !session?.user) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, department, created_at')
      .eq('id', session.user.id)
      .maybeSingle();
    setProfile((data as Profile) ?? null);
  };

  const role = profile?.role ?? null;
  const isAdmin = role === 'admin';
  const isManager = role === 'admin' || role === 'manager';
  const isStaff = role !== null && STAFF_ROLES.includes(role);

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    profile,
    role,
    isAdmin,
    isManager,
    isStaff,
    loading,
    refreshProfile,
    signIn: async (email, password) => {
      if (!supabase) return { error: 'Supabase not configured' };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? { error: error.message } : {};
    },
    signUp: async (email, password, fullName) => {
      if (!supabase) return { error: 'Supabase not configured' };
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      return error ? { error: error.message } : {};
    },
    signInWithMicrosoft: async () => {
      if (!supabase) return { error: 'Supabase not configured' };
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          scopes: 'openid email profile offline_access',
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      return error ? { error: error.message } : {};
    },
    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
