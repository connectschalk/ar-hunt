"use client";

import { useAuth } from "@/app/components/AuthProvider";

export function DevAuthEmail() {
  const { user, loading, configured } = useAuth();

  if (!configured) {
    return (
      <p className="text-sm text-zinc-500">
        Auth: Supabase not configured (env vars missing).
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Auth: Loading session…</p>;
  }

  if (!user?.email) {
    return (
      <p className="text-sm text-amber-400/95" aria-live="polite">
        Not logged in
      </p>
    );
  }

  return (
    <p className="text-sm text-emerald-400/95" aria-live="polite">
      {user.email}
    </p>
  );
}
