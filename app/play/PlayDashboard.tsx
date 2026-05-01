"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/app/components/AuthProvider";
import { PlayerBag } from "@/app/components/PlayerBag";
import { SurvivorHeaderLogo } from "@/app/components/SurvivorHeaderLogo";
import { SurvivorNav } from "@/app/components/SurvivorNav";
import { TribeChallengeCard } from "@/app/components/TribeChallengeCard";
import { bagEntryFromQuickExploreFind } from "@/lib/map-marker-icons";
import {
  addXp,
  applyDailyStreakOnPlay,
  getAchievementList,
  xpIntoCurrentLevel,
  XP_QUICK_EXPLORE,
} from "@/lib/player-progression";
import {
  btnPrimary,
  btnSecondary,
  linkTeal,
  statPill,
  statPillLabel,
  survivorPageBg,
  tribalPanel,
  tribalPanelInner,
} from "@/lib/survivor-ui";
import {
  type CloudSaveUiStatus,
  subscribeCloudSaveStatus,
} from "@/lib/cloud-save-status";
import {
  addOrIncrementBag,
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
    <div className={statPill}>
      <p className={statPillLabel}>{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-[#f5f0e6]">
        {value}
      </p>
    </div>
  );
}

export function PlayDashboard() {
  const { user: authUser, loading: authLoading } = useAuth();
  const [game, setGame] = useState<GameState>(DEFAULT_GAME_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [tribeName, setTribeName] = useState<string | null>(null);
  const [lastFind, setLastFind] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudSaveUiStatus>("local");

  useEffect(() => subscribeCloudSaveStatus(setCloudStatus), []);

  useEffect(() => {
    const onMerged = () => setGame(loadGameState());
    window.addEventListener("survivor-go-game-merged", onMerged);
    return () => window.removeEventListener("survivor-go-game-merged", onMerged);
  }, []);

  useEffect(() => {
    const raw = loadGameState();
    const withStreak = applyDailyStreakOnPlay(raw);
    saveGameState(withStreak);
    setGame(loadGameState());
    setTribeName(loadTribeName());
    setHydrated(true);
  }, []);

  const persist = useCallback((next: GameState) => {
    setGame(next);
    saveGameState(next);
  }, []);

  const syncGameFromStorage = useCallback(() => {
    setGame(loadGameState());
  }, []);

  const canExplore = game.energy >= EXPLORE_COST;
  const needRest = game.energy === 0;

  const xpProgressPct = xpIntoCurrentLevel(game.xp);
  const achievementRows = getAchievementList(game);
  const achievementsUnlocked = achievementRows.filter((a) => a.unlocked).length;

  const cloudLine = !authUser
    ? "Local save only"
    : cloudStatus === "cloud_error"
      ? "Cloud sync issue"
      : "Cloud save active";

  const explore = () => {
    if (!canExplore) return;
    const found = randomFind();
    let next = { ...game, energy: game.energy - EXPLORE_COST };
    next = found.apply(next);
    next = addOrIncrementBag(next, bagEntryFromQuickExploreFind(found));
    next = addXp(next, XP_QUICK_EXPLORE);
    persist(next);
    setLastFind(
      `You found a ${found.title}! ${found.detail}. (−${EXPLORE_COST} Energy) +${XP_QUICK_EXPLORE} XP.`,
    );
  };

  const rest = () => {
    const next = { ...game, energy: 100 };
    persist(next);
    setLastFind(null);
  };

  return (
    <div className={survivorPageBg}>
      <SurvivorHeaderLogo subtitle="Island dashboard" />
      {hydrated && !authLoading && (
        <p
          className="px-4 pt-2 text-center text-xs font-medium text-teal-400/85"
          role="status"
        >
          {cloudLine}
        </p>
      )}
      {!hydrated && (
        <p className="py-2 text-center text-xs text-teal-500/80">
          Loading your camp…
        </p>
      )}

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-6 pb-28">
        <section className={`${tribalPanel} p-5`} aria-label="Player progress">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-200/95">
            Player progress
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatPill label="Level" value={game.level} />
            <StatPill label="Total XP" value={game.xp} />
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-[#f5f0e6]/75">
              <span>Next level</span>
              <span className="tabular-nums">
                {xpProgressPct} / 100 XP this level
              </span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/60 ring-1 ring-teal-500/25">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-teal-400"
                style={{ width: `${xpProgressPct}%` }}
              />
            </div>
          </div>
          <p className="mt-4 text-sm text-teal-200/80">
            Daily streak:{" "}
            <span className="font-semibold text-amber-200 tabular-nums">
              {game.dailyStreak}
            </span>{" "}
            {game.dailyStreak === 1 ? "day" : "days"}
          </p>
          <p className="mt-2 text-sm text-teal-200/70">
            Achievements:{" "}
            <span className="font-semibold text-[#f5f0e6] tabular-nums">
              {achievementsUnlocked}
            </span>
            <span className="text-teal-500/80">
              {" "}
              / {achievementRows.length}
            </span>
          </p>
        </section>

        <section className={`${tribalPanel} p-5`} aria-label="Player status">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-200/95">
            Survivor status
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatPill label="Energy" value={game.energy} />
            <StatPill label="Food" value={game.food} />
            <StatPill label="Water" value={game.water} />
            <StatPill label="Materials" value={game.materials} />
            <StatPill label="Survivor Coins" value={game.coins} />
            <StatPill label="Hidden Immunity Idols" value={game.idols} />
            <StatPill label="Advantage Clues" value={game.clues} />
          </div>
        </section>

        <section className={`${tribalPanelInner} p-5`} aria-label="Player bag">
          <h2 className="text-lg font-semibold text-amber-100/95">Bag</h2>
          <p className="mt-1 text-sm text-teal-200/55">
            Items you&apos;ve picked up — tap markers on the map or use Quick
            Explore.
          </p>
          <PlayerBag items={game.bag} />
        </section>

        <section className={`${tribalPanelInner} p-5`}>
          <h2 className="text-lg font-semibold text-amber-100/95">
            Achievements
          </h2>
          <ul className="mt-3 space-y-2">
            {achievementRows.map((a) => (
              <li
                key={a.id}
                className={`rounded-xl border px-3 py-2 text-xs leading-snug sm:text-sm ${
                  a.unlocked
                    ? "border-amber-500/35 bg-amber-950/25 text-[#f5f0e6]"
                    : "border-white/10 bg-black/30 text-zinc-500"
                }`}
              >
                <span className="font-semibold">{a.title}</span>
                <span className={a.unlocked ? "text-teal-200/70" : ""}>
                  {" "}
                  — {a.description}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${tribalPanelInner} p-5`}>
          <Link
            href="/map"
            className={`flex w-full items-center justify-center ${btnPrimary}`}
          >
            Explore Island
          </Link>
          <p className="mt-2 text-center text-xs text-teal-200/55">
            Map — supplies near your location
          </p>
          <button
            type="button"
            onClick={explore}
            disabled={!canExplore}
            className={`mt-4 w-full ${btnSecondary}`}
          >
            Quick Explore
          </button>
          {!canExplore && (
            <p
              className="mt-3 text-center text-sm text-amber-200/85"
              role="status"
            >
              {needRest
                ? "Rest to use Quick Explore again."
                : `Need at least ${EXPLORE_COST} energy for Quick Explore.`}
            </p>
          )}
          {lastFind && (
            <p className="mt-3 rounded-xl border border-teal-800/40 bg-black/40 px-3 py-2 text-center text-sm text-[#f5f0e6]/90">
              {lastFind}
            </p>
          )}
          <button
            type="button"
            onClick={rest}
            className={`mt-4 w-full ${btnSecondary} text-sm`}
          >
            Rest — restore Energy to 100
          </button>
        </section>

        <section className={`${tribalPanelInner} p-5`}>
          <h2 className="text-lg font-semibold text-amber-100/95">Tribe</h2>
          {tribeName ? (
            <p className="mt-2 text-sm text-[#f5f0e6]/80">
              You&apos;re aligned with{" "}
              <span className="font-semibold text-amber-200">{tribeName}</span>
              .{" "}
              <Link href="/join" className={linkTeal}>
                Change
              </Link>
            </p>
          ) : (
            <p className="mt-2 text-sm text-teal-200/60">
              No tribe yet.{" "}
              <Link href="/join" className={linkTeal}>
                Join or create one
              </Link>
              .
            </p>
          )}
        </section>

        <TribeChallengeCard onGameSynced={syncGameFromStorage} />
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-10">
        <SurvivorNav />
      </div>
    </div>
  );
}
