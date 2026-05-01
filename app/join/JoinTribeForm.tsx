"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { SurvivorHeaderLogo } from "@/app/components/SurvivorHeaderLogo";
import { SurvivorNav } from "@/app/components/SurvivorNav";
import { TribeChallengeCard } from "@/app/components/TribeChallengeCard";
import {
  btnPrimary,
  linkTeal,
  survivorPageBg,
  tribalPanel,
  tribalPanelInner,
} from "@/lib/survivor-ui";
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
    <div className={survivorPageBg}>
      <SurvivorHeaderLogo title="Join or Create a Tribe" />

      <main className="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 py-8 pb-28">
        <form className={`${tribalPanel} p-6`} onSubmit={create}>
          <label
            htmlFor="tribe-name"
            className="text-sm font-medium text-amber-100/95"
          >
            Tribe name
          </label>
          <input
            id="tribe-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Palm Cove Alliance"
            className="mt-2 w-full rounded-2xl border border-teal-700/45 bg-black/50 px-4 py-3 text-[#f5f0e6] placeholder:text-zinc-600 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
            autoComplete="off"
            maxLength={48}
          />
          <button type="submit" className={`mt-5 w-full ${btnPrimary}`}>
            Create Tribe
          </button>
        </form>

        {hydrated && saved && (
          <section className={`${tribalPanelInner} p-5`}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-200/95">
              Your tribe
            </h2>
            <p className="mt-2 text-lg font-semibold text-[#f5f0e6]">{saved}</p>
            <p className="mt-3 text-sm leading-relaxed text-teal-200/60">
              Stored on this device. Contribute supplies to the weekly challenge
              below.
            </p>
          </section>
        )}

        <TribeChallengeCard tribeGated hasTribe={Boolean(saved)} />

        <p className="text-center text-sm text-teal-200/50">
          <Link href="/play" className={linkTeal}>
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
