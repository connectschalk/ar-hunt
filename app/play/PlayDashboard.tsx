"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SurvivorNav } from "@/app/components/SurvivorNav";
import {
  DEFAULT_GAME_STATE,
  EXPLORE_COST,
  loadGameState,
  loadTribeName,
  randomFind,
  saveGameState,
  type GameState,
} from "@/lib/survivor-mvp";

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-emerald-800/60 bg-emerald-950/40 px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-500/90">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
        {value}
      </p>
    </div>
  );
}

export function PlayDashboard() {
  const [game, setGame] = useState<GameState>(DEFAULT_GAME_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [tribeName, setTribeName] = useState<string | null>(null);
  const [lastFind, setLastFind] = useState<string | null>(null);

  useEffect(() => {
    setGame(loadGameState());
    setTribeName(loadTribeName());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: GameState) => {
    setGame(next);
    saveGameState(next);
  }, []);

  const canExplore = game.energy >= EXPLORE_COST;
  const needRest = game.energy === 0;

  const explore = () => {
    if (!canExplore) return;
    const found = randomFind();
    let next = { ...game, energy: game.energy - EXPLORE_COST };
    next = found.apply(next);
    persist(next);
    setLastFind(`You found a ${found.title}! ${found.detail}. (−${EXPLORE_COST} Energy)`);
  };

  const rest = () => {
    const next = { ...game, energy: 100 };
    persist(next);
    setLastFind(null);
  };

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a1628] via-[#0c1f18] to-black text-zinc-100">
      <header className="border-b border-emerald-900/40 bg-black/20 px-4 py-6 text-center backdrop-blur-sm">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Survivor GO
        </h1>
        <p className="mt-2 text-sm text-emerald-200/60">Island dashboard</p>
        {!hydrated && (
          <p className="mt-2 text-xs text-emerald-600/80">Loading your camp…</p>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-6 pb-28">
        <section
          className="rounded-3xl border border-amber-900/30 bg-gradient-to-br from-amber-950/50 to-emerald-950/30 p-5 shadow-lg shadow-black/40"
          aria-label="Player status"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200/90">
            Survivor status
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatPill label="Energy" value={game.energy} />
            <StatPill label="Food" value={game.food} />
            <StatPill label="Water" value={game.water} />
            <StatPill label="Materials" value={game.materials} />
            <StatPill label="Survivor Coins" value={game.coins} />
            <StatPill
              label="Hidden Immunity Idols"
              value={game.idols}
            />
            <StatPill label="Advantage Clues" value={game.clues} />
          </div>
        </section>

        <section className="rounded-3xl border border-emerald-800/50 bg-emerald-950/20 p-5">
          <Link
            href="/map"
            className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 py-4 text-base font-bold text-emerald-950 shadow-md transition hover:from-amber-400 hover:to-amber-500"
          >
            Explore Island
          </Link>
          <p className="mt-2 text-center text-xs text-emerald-200/50">
            Map — find supplies near your location
          </p>
          <button
            type="button"
            onClick={explore}
            disabled={!canExplore}
            className="mt-4 w-full rounded-2xl border border-amber-600/60 bg-amber-950/40 py-3.5 text-base font-bold text-amber-100 shadow-md transition enabled:hover:bg-amber-900/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Quick Explore
          </button>
          {!canExplore && (
            <p
              className="mt-3 text-center text-sm text-amber-200/80"
              role="status"
            >
              {needRest
                ? "Rest to use Quick Explore again."
                : `Need at least ${EXPLORE_COST} energy for Quick Explore.`}
            </p>
          )}
          {lastFind && (
            <p className="mt-3 rounded-xl bg-black/30 px-3 py-2 text-center text-sm text-emerald-100/90">
              {lastFind}
            </p>
          )}
          <button
            type="button"
            onClick={rest}
            className="mt-4 w-full rounded-2xl border border-emerald-600/50 bg-emerald-900/30 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-900/50"
          >
            Rest — restore Energy to 100
          </button>
        </section>

        <section className="rounded-3xl border border-emerald-800/40 bg-black/25 p-5">
          <h2 className="text-lg font-semibold text-amber-100">Inventory</h2>
          <p className="mt-1 text-sm text-emerald-200/60">
            What you&apos;ve gathered on the island.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-zinc-200">
            <li className="flex justify-between border-b border-white/5 py-2">
              <span className="text-emerald-400/80">Food</span>
              <span className="tabular-nums font-medium">{game.food}</span>
            </li>
            <li className="flex justify-between border-b border-white/5 py-2">
              <span className="text-emerald-400/80">Water</span>
              <span className="tabular-nums font-medium">{game.water}</span>
            </li>
            <li className="flex justify-between border-b border-white/5 py-2">
              <span className="text-emerald-400/80">Materials</span>
              <span className="tabular-nums font-medium">{game.materials}</span>
            </li>
            <li className="flex justify-between border-b border-white/5 py-2">
              <span className="text-emerald-400/80">Survivor Coins</span>
              <span className="tabular-nums font-medium">{game.coins}</span>
            </li>
            <li className="flex justify-between border-b border-white/5 py-2">
              <span className="text-emerald-400/80">Hidden Immunity Idols</span>
              <span className="tabular-nums font-medium">{game.idols}</span>
            </li>
            <li className="flex justify-between py-2">
              <span className="text-emerald-400/80">Advantage Clues</span>
              <span className="tabular-nums font-medium">{game.clues}</span>
            </li>
          </ul>
        </section>

        <section className="rounded-3xl border border-emerald-800/40 bg-black/25 p-5">
          <h2 className="text-lg font-semibold text-amber-100">Tribe</h2>
          {tribeName ? (
            <p className="mt-2 text-sm text-zinc-300">
              You&apos;re aligned with{" "}
              <span className="font-semibold text-amber-200">{tribeName}</span>
              .{" "}
              <Link href="/join" className="text-emerald-400 underline-offset-2 hover:underline">
                Change
              </Link>
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-400">
              No tribe yet.{" "}
              <Link
                href="/join"
                className="font-medium text-amber-300 hover:underline"
              >
                Join or create one
              </Link>
              .
            </p>
          )}
        </section>

        <section className="rounded-3xl border border-amber-900/25 bg-amber-950/15 p-5">
          <h2 className="text-lg font-semibold text-amber-100">
            Weekly Challenge
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Tribe challenges and seasonal goals are coming soon. Keep exploring
            to stock up.
          </p>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-10">
        <SurvivorNav />
      </div>
    </div>
  );
}
