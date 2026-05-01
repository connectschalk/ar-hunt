"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { SurvivorNav } from "@/app/components/SurvivorNav";
import { loadTribeName, saveTribeName } from "@/lib/survivor-mvp";

export function JoinTribeForm() {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSaved(loadTribeName());
    setHydrated(true);
  }, []);

  const create = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    saveTribeName(trimmed);
    setSaved(trimmed);
    setName("");
  };

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a1628] via-[#0c1f18] to-black text-zinc-100">
      <header className="border-b border-emerald-900/40 bg-black/20 px-4 py-8 text-center backdrop-blur-sm">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-amber-400/80">
          Survivor GO
        </p>
        <h1 className="mt-3 text-2xl font-bold text-white sm:text-3xl">
          Join or Create a Tribe
        </h1>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 pb-28">
        <form
          onSubmit={create}
          className="rounded-3xl border border-emerald-800/50 bg-emerald-950/20 p-6 shadow-lg"
        >
          <label htmlFor="tribe-name" className="text-sm font-medium text-amber-100/90">
            Tribe name
          </label>
          <input
            id="tribe-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Palm Cove Alliance"
            className="mt-2 w-full rounded-2xl border border-emerald-800/60 bg-black/40 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
            autoComplete="off"
            maxLength={48}
          />
          <button
            type="submit"
            className="mt-5 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 text-base font-bold text-emerald-950 transition hover:from-amber-400 hover:to-amber-500"
          >
            Create Tribe
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Tribe challenges coming soon.
        </p>

        {hydrated && saved && (
          <section className="mt-6 rounded-3xl border border-amber-900/30 bg-amber-950/20 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200/90">
              Your tribe
            </h2>
            <p className="mt-2 text-lg font-semibold text-white">{saved}</p>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Stored on this device. Challenges with your tribe are coming soon.
            </p>
          </section>
        )}

        <p className="mt-8 text-center text-sm text-zinc-500">
          <Link href="/play" className="text-emerald-400 hover:underline">
            Back to island dashboard
          </Link>
        </p>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-10">
        <SurvivorNav />
      </div>
    </div>
  );
}
