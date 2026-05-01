"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { resetCloudSaveStatusForLogout } from "@/lib/cloud-save-status";
import { createBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { runSessionPlayerStateSync } from "@/lib/supabase/player-state";
import { hydrateLocalTribeFromSupabase } from "@/lib/supabase/tribes";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) {
      setUser(null);
      setLoading(false);
      return;
    }

    const supabase = createBrowserClient();

    let cancelled = false;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [configured]);

  useEffect(() => {
    if (!user) {
      resetCloudSaveStatusForLogout();
    }
  }, [user]);

  useEffect(() => {
    if (!configured || !user?.id) return;
    void runSessionPlayerStateSync(user.id);
  }, [configured, user?.id]);

  useEffect(() => {
    if (!configured || !user?.id) return;
    void hydrateLocalTribeFromSupabase(user.id);
  }, [configured, user?.id]);

  const value = useMemo(
    () => ({ user, loading, configured }),
    [user, loading, configured],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
