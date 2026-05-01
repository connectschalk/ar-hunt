"use client";

import { useCallback, useEffect, useState } from "react";
import {
  contributeOneToChallenge,
  goalDescription,
  goalTypeLabel,
  loadTribeChallenge,
  playerCanContribute,
  saveTribeChallenge,
  type TribeChallengeState,
} from "@/lib/tribe-challenge";
import {
  applyChallengeContributionProgression,
  formatContributeLine,
} from "@/lib/player-progression";
import { tribalPanel, btnPrimary } from "@/lib/survivor-ui";
import {
  loadGameState,
  saveGameState,
  type GameState,
} from "@/lib/survivor-mvp";

type TribeChallengeCardProps = {
  tribeGated?: boolean;
  hasTribe?: boolean;
  onGameSynced?: () => void;
};

export function TribeChallengeCard({
  tribeGated = false,
  hasTribe = true,
  onGameSynced,
}: TribeChallengeCardProps) {
  const [game, setGame] = useState<GameState>(() => loadGameState());
  const [challenge, setChallenge] = useState<TribeChallengeState>(() =>
    loadTribeChallenge(),
  );
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setGame(loadGameState());
    setChallenge(loadTribeChallenge());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const canContributeResources = playerCanContribute(game, challenge);
  const tribeOk = !tribeGated || hasTribe;
  const contributeDisabled =
    challenge.completed || !tribeOk || !canContributeResources;

  const progressPct = Math.min(
    100,
    (challenge.contributedAmount / challenge.targetAmount) * 100,
  );

  const onContribute = () => {
    setNotice(null);
    if (contributeDisabled) return;
    const currentGame = loadGameState();
    const currentChallenge = loadTribeChallenge();
    const prevContributed = currentChallenge.contributedAmount;

    const result = contributeOneToChallenge(currentGame, currentChallenge);
    if (!result) return;

    const prog = applyChallengeContributionProgression(
      result.game,
      currentChallenge.goalType,
      prevContributed,
      Boolean(result.completionMessage),
    );

    saveGameState(prog.game);
    saveTribeChallenge(result.challenge);
    setGame(prog.game);
    setChallenge(result.challenge);
    onGameSynced?.();

    const parts = [
      formatContributeLine(currentChallenge.goalType),
      ...prog.xpParts,
    ];
    if (result.completionMessage) {
      parts.push(result.completionMessage);
    }
    setNotice(parts.join(" "));
  };

  return (
    <section
      className={`${tribalPanel} p-5 ${challenge.completed ? "border-amber-500/35" : ""}`}
      aria-label="Weekly tribe challenge"
    >
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-amber-200/95">
        Weekly Tribe Challenge
      </h2>
      <p className="mt-2 text-lg font-semibold text-[#f5f0e6]">
        {challenge.challengeName}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-teal-200/65">
        {goalDescription(challenge)}
      </p>
      <p className="mt-2 text-xs text-cyan-200/55">
        Reward: {challenge.rewardCoins} Survivor Coins
      </p>

      <div className="mt-4">
        <div className="flex justify-between text-xs font-medium text-[#f5f0e6]/80">
          <span>Progress</span>
          <span className="tabular-nums">
            {challenge.contributedAmount} / {challenge.targetAmount}{" "}
            {goalTypeLabel(challenge.goalType)}
          </span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/60 ring-1 ring-teal-500/25">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-orange-300 shadow-[0_0_12px_rgba(251,191,36,0.5)] transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {tribeGated && !hasTribe && (
        <p className="mt-4 rounded-xl border border-cyan-800/40 bg-black/35 px-3 py-2 text-sm text-cyan-200/80">
          Create or join a tribe to contribute to challenges.
        </p>
      )}

      <button
        type="button"
        onClick={onContribute}
        disabled={contributeDisabled}
        className={`mt-4 w-full ${btnPrimary}`}
      >
        Contribute
      </button>
      {challenge.completed && (
        <p className="mt-2 text-center text-xs text-amber-200/80">
          This week&apos;s goal is complete.
        </p>
      )}
      {!challenge.completed && tribeOk && !canContributeResources && (
        <p className="mt-2 text-center text-xs text-cyan-200/70">
          Not enough {goalTypeLabel(challenge.goalType).toLowerCase()} to
          contribute.
        </p>
      )}

      {notice && (
        <p
          className="mt-3 rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-center text-sm font-medium leading-snug text-amber-100"
          role="status"
        >
          {notice}
        </p>
      )}
    </section>
  );
}
