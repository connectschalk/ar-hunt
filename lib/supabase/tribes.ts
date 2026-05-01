import { createBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { saveTribeToDevice } from "@/lib/survivor-mvp";

export type TribeRow = {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
};

function warn(message: string, err: unknown) {
  console.warn(`[Survivor GO tribes] ${message}`, err);
}

/**
 * Load tribe membership from Supabase and mirror name + id to localStorage.
 * On failure, leaves existing localStorage untouched (fallback).
 */
export async function hydrateLocalTribeFromSupabase(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const { data, error } = await getUserTribe(userId);
    if (error) {
      warn("getUserTribe failed; using local tribe if any", error);
      return;
    }
    if (data) {
      saveTribeToDevice(data.name, data.id);
    }
  } catch (e) {
    warn("hydrateLocalTribeFromSupabase failed; using local tribe if any", e);
  }
}

export async function createTribe(
  name: string,
  userId: string,
): Promise<{ data: TribeRow | null; error: Error | null }> {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: new Error("Supabase is not configured."),
    };
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return { data: null, error: new Error("Tribe name is required.") };
  }

  const supabase = createBrowserClient();
  const { data: tribe, error: insertErr } = await supabase
    .from("tribes")
    .insert({ name: trimmed, created_by: userId })
    .select("id, name, created_by, created_at")
    .single();

  if (insertErr || !tribe) {
    warn("createTribe insert failed", insertErr);
    return { data: null, error: insertErr ?? new Error("Failed to create tribe.") };
  }

  const { error: memberErr } = await supabase.from("tribe_members").insert({
    tribe_id: tribe.id,
    user_id: userId,
    role: "admin",
  });

  if (memberErr) {
    warn("createTribe member insert failed", memberErr);
    return { data: null, error: memberErr };
  }

  return { data: tribe as TribeRow, error: null };
}

export async function joinTribe(
  tribeId: string,
  userId: string,
): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured()) {
    return { error: new Error("Supabase is not configured.") };
  }

  const supabase = createBrowserClient();
  const { error } = await supabase.from("tribe_members").insert({
    tribe_id: tribeId,
    user_id: userId,
    role: "member",
  });

  if (error) {
    warn("joinTribe failed", error);
    return { error };
  }
  return { error: null };
}

export async function getUserTribe(
  userId: string,
): Promise<{ data: TribeRow | null; error: Error | null }> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: null };
  }

  const supabase = createBrowserClient();
  const { data: rows, error } = await supabase
    .from("tribe_members")
    .select(
      `
      joined_at,
      tribes ( id, name, created_by, created_at )
    `,
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1);

  if (error) {
    warn("getUserTribe failed", error);
    return { data: null, error };
  }

  const row = rows?.[0];
  const nested = row?.tribes as TribeRow | TribeRow[] | null | undefined;
  const tribe = Array.isArray(nested) ? nested[0] : nested;
  if (!tribe?.id) {
    return { data: null, error: null };
  }

  return { data: tribe, error: null };
}

export async function searchTribes(
  query: string,
): Promise<{ data: TribeRow[]; error: Error | null }> {
  if (!isSupabaseConfigured()) {
    return { data: [], error: null };
  }

  const supabase = createBrowserClient();
  const q = query.trim();

  let builder = supabase
    .from("tribes")
    .select("id, name, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (q) {
    builder = builder.ilike("name", `%${q}%`);
  }

  const { data, error } = await builder;

  if (error) {
    warn("searchTribes failed", error);
    return { data: [], error };
  }

  return { data: (data ?? []) as TribeRow[], error: null };
}
