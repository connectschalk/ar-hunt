import { createBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

async function ensureProfileForUser(userId: string, displayName: string) {
  const supabase = createBrowserClient();
  const { error } = await supabase.from("profiles").upsert(
    { id: userId, display_name: displayName },
    { onConflict: "id" },
  );
  return error;
}

export async function signUp(email: string, password: string) {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: new Error(
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
      ),
    };
  }
  const supabase = createBrowserClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { data: null, error };

  if (data.user && data.session) {
    const err = await ensureProfileForUser(data.user.id, email);
    if (err) return { data, error: err };
  }

  return { data, error: null };
}

export async function signIn(email: string, password: string) {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: new Error(
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
      ),
    };
  }
  const supabase = createBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { data: null, error };

  if (data.user) {
    const label = data.user.email ?? email;
    const err = await ensureProfileForUser(data.user.id, label);
    if (err) return { data, error: err };
  }

  return { data, error: null };
}

export async function signOut() {
  if (!isSupabaseConfigured()) {
    return { error: null };
  }
  const supabase = createBrowserClient();
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createBrowserClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) return null;
  return user;
}
