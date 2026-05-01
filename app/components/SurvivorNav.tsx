"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { signOut } from "@/lib/supabase/auth";

const linkBase =
  "rounded-xl px-3 py-2.5 text-xs font-semibold transition sm:text-sm";
const linkIdle =
  "text-cyan-200/75 hover:bg-cyan-950/50 hover:text-cyan-100 hover:shadow-[0_0_16px_rgba(34,211,238,0.12)]";

export function SurvivorNav() {
  const router = useRouter();
  const { user, loading, configured } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const onLogout = useCallback(async () => {
    setLoggingOut(true);
    await signOut();
    setLoggingOut(false);
    router.refresh();
  }, [router]);

  const loggedIn = Boolean(configured && user);

  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-1 border-t border-teal-900/50 bg-[#030506]/92 px-2 py-2 shadow-[0_-8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md"
      aria-label="Main navigation"
    >
      <Link href="/" className={`${linkBase} ${linkIdle}`}>
        Home
      </Link>
      <Link href="/play" className={`${linkBase} ${linkIdle}`}>
        Play
      </Link>
      <Link href="/map" className={`${linkBase} ${linkIdle}`}>
        Map
      </Link>
      <Link href="/join" className={`${linkBase} ${linkIdle}`}>
        Tribe
      </Link>
      {!loading && !loggedIn && (
        <Link
          href="/login"
          className={`${linkBase} ${linkIdle} border border-teal-700/40`}
        >
          Login
        </Link>
      )}
      {!loading && loggedIn && (
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          className={`${linkBase} ${linkIdle} border border-teal-700/40 disabled:opacity-50`}
        >
          {loggingOut ? "…" : "Logout"}
        </button>
      )}
      <Link
        href="/dev"
        className={`${linkBase} ${linkIdle} text-zinc-500 hover:text-zinc-300`}
      >
        Dev
      </Link>
    </nav>
  );
}
