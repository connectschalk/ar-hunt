"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "@/lib/supabase/auth";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  btnPrimary,
  btnSecondary,
  survivorPageBg,
  tribalPanel,
} from "@/lib/survivor-ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isSupabaseConfigured()) {
      setError(
        "Supabase is not configured. Add environment variables and restart.",
      );
      return;
    }
    setPending(true);
    const { error: err } = await signIn(email.trim(), password);
    setPending(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/play");
    router.refresh();
  };

  return (
    <div className={`${survivorPageBg} px-4 py-12`}>
      <div className="mx-auto w-full max-w-md">
        <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-teal-500/80">
          Survivor GO
        </p>
        <h1 className="mt-2 text-center text-2xl font-semibold text-[#f5f0e6]">
          Log in
        </h1>
        <form
          onSubmit={onSubmit}
          className={`${tribalPanel} mt-8 p-6`}
          aria-label="Log in form"
        >
          <label className="block text-sm font-medium text-teal-200/85">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-xl border border-teal-700/50 bg-black/50 px-3 py-2.5 text-[#f5f0e6] outline-none ring-teal-500/30 placeholder:text-zinc-600 focus:ring-2"
              placeholder="you@example.com"
            />
          </label>
          <label className="mt-4 block text-sm font-medium text-teal-200/85">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-teal-700/50 bg-black/50 px-3 py-2.5 text-[#f5f0e6] outline-none ring-teal-500/30 placeholder:text-zinc-600 focus:ring-2"
            />
          </label>
          {error && (
            <p className="mt-4 text-sm text-amber-300/95" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className={`mt-6 w-full ${btnPrimary}`}
          >
            {pending ? "Signing in…" : "Log in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-teal-200/60">
          Need an account?{" "}
          <Link href="/signup" className="font-medium text-cyan-300 underline-offset-2 hover:underline">
            Sign up
          </Link>
        </p>
        <Link
          href="/"
          className={`mt-8 flex justify-center ${btnSecondary} text-sm`}
        >
          ← Back home
        </Link>
      </div>
    </div>
  );
}
