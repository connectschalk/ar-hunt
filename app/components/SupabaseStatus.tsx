"use client";

import { useEffect, useState } from "react";
import {
  createBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

export function SupabaseStatus() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setMessage("Supabase not configured");
      return;
    }
    try {
      createBrowserClient();
      setMessage("Supabase connected");
    } catch {
      setMessage("Supabase not configured");
    }
  }, []);

  if (message === null) {
    return (
      <p className="text-sm text-zinc-500" aria-live="polite">
        Checking Supabase…
      </p>
    );
  }

  const ok = message === "Supabase connected";
  return (
    <p
      className={`text-sm ${ok ? "text-emerald-400" : "text-amber-400/95"}`}
      aria-live="polite"
    >
      {message}
    </p>
  );
}
