"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { SurvivorHeaderLogo } from "@/app/components/SurvivorHeaderLogo";
import { SurvivorNav } from "@/app/components/SurvivorNav";
import { TribeChallengeCard } from "@/app/components/TribeChallengeCard";
import {
  btnPrimary,
  btnSecondary,
  linkTeal,
  survivorPageBg,
  tribalPanel,
  tribalPanelInner,
} from "@/lib/survivor-ui";
import {
  loadTribeId,
  loadTribeName,
  saveTribeName,
  saveTribeToDevice,
} from "@/lib/survivor-mvp";
import {
  createTribe,
  joinTribe,
  searchTribes,
  type TribeRow,
} from "@/lib/supabase/tribes";

export function JoinTribeForm() {
  const { user, loading: authLoading, configured } = useAuth();
  const [name, setName] = useState("");
  const [searchText, setSearchText] = useState("");
  const [tribeList, setTribeList] = useState<TribeRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [joinBusyId, setJoinBusyId] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [savedTribeId, setSavedTribeId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const refreshLocalTribe = useCallback(() => {
    setSavedName(loadTribeName());
    setSavedTribeId(loadTribeId());
  }, []);

  useEffect(() => {
    refreshLocalTribe();
    setHydrated(true);
  }, [refreshLocalTribe]);

  useEffect(() => {
    const onTribe = () => refreshLocalTribe();
    window.addEventListener("survivor-go-tribe-updated", onTribe);
    return () => window.removeEventListener("survivor-go-tribe-updated", onTribe);
  }, [refreshLocalTribe]);

  const loadTribeList = useCallback(async (query: string) => {
    setListLoading(true);
    const { data, error } = await searchTribes(query);
    if (error) {
      console.warn("[JoinTribeForm] Could not load tribes; keeping local state only.", error);
    }
    setTribeList(data);
    setListLoading(false);
  }, []);

  useEffect(() => {
    if (!user?.id || !configured) return;
    void loadTribeList("");
  }, [user?.id, configured, loadTribeList]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    if (!user?.id) {
      saveTribeName(trimmed);
      refreshLocalTribe();
      setName("");
      return;
    }

    setCreateBusy(true);
    const { data, error } = await createTribe(trimmed, user.id);
    setCreateBusy(false);
    if (error) {
      console.warn("[JoinTribeForm] createTribe failed; try again or play offline.", error);
      return;
    }
    if (data) {
      saveTribeToDevice(data.name, data.id);
      refreshLocalTribe();
      setName("");
      void loadTribeList(searchText.trim());
    }
  };

  const runSearch = (e: FormEvent) => {
    e.preventDefault();
    void loadTribeList(searchText.trim());
  };

  const join = async (row: TribeRow) => {
    if (!user?.id) return;
    setJoinBusyId(row.id);
    const { error } = await joinTribe(row.id, user.id);
    setJoinBusyId(null);
    if (error) {
      console.warn("[JoinTribeForm] joinTribe failed.", error);
      return;
    }
    saveTribeToDevice(row.name, row.id);
    refreshLocalTribe();
  };

  const loggedIn = Boolean(user?.id);
  const showCloudUi = loggedIn && configured;

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
          <button
            type="submit"
            disabled={createBusy || authLoading}
            className={`mt-5 w-full ${btnPrimary} disabled:opacity-60`}
          >
            {createBusy ? "Creating…" : "Create Tribe"}
          </button>
          {showCloudUi && (
            <p className="mt-3 text-xs leading-relaxed text-teal-200/55">
              Signed in — your tribe is saved to Survivor GO online.
            </p>
          )}
        </form>

        {showCloudUi && (
          <section className={`${tribalPanelInner} p-5`}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-200/95">
              Join a tribe
            </h2>
            <p className="mt-1 text-xs text-teal-200/55">
              Search by name or browse the latest tribes below.
            </p>
            <form className="mt-4 flex gap-2" onSubmit={runSearch}>
              <input
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search tribes…"
                className="min-w-0 flex-1 rounded-2xl border border-teal-700/45 bg-black/50 px-3 py-2.5 text-sm text-[#f5f0e6] placeholder:text-zinc-600 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/25"
              />
              <button type="submit" className={`shrink-0 ${btnSecondary}`}>
                Search
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {listLoading ? (
                <p className="text-sm text-teal-200/50">Loading tribes…</p>
              ) : tribeList.length === 0 ? (
                <p className="text-sm text-teal-200/50">No tribes match.</p>
              ) : (
                <ul className="space-y-2">
                  {tribeList.map((t) => {
                    const isYours = savedTribeId === t.id;
                    const busy = joinBusyId === t.id;
                    return (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-teal-800/35 bg-black/35 px-3 py-2.5"
                      >
                        <span className="min-w-0 truncate font-medium text-[#f5f0e6]/95">
                          {t.name}
                        </span>
                        <button
                          type="button"
                          disabled={isYours || busy || authLoading}
                          onClick={() => join(t)}
                          className={`shrink-0 rounded-xl border border-teal-600/50 px-3 py-1.5 text-xs font-semibold text-teal-100 transition hover:border-amber-500/45 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {isYours ? "Joined" : busy ? "…" : "Join"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        {hydrated && savedName && (
          <section className={`${tribalPanelInner} p-5`}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-200/95">
              Your tribe
            </h2>
            <p className="mt-2 text-lg font-semibold text-[#f5f0e6]">{savedName}</p>
            <p className="mt-3 text-sm leading-relaxed text-teal-200/60">
              {loggedIn && savedTribeId
                ? "Stored on this device and linked to your account."
                : loggedIn
                  ? "Stored on this device. Create or join above to sync online."
                  : "Stored on this device. Contribute supplies to the weekly challenge below."}
            </p>
          </section>
        )}

        <TribeChallengeCard tribeGated hasTribe={Boolean(savedName)} />

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
