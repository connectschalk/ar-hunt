import { formatCollectToast, type MapItem } from "@/lib/map-items";
import type { ChallengeGoalType } from "@/lib/tribe-challenge";
import type { GameState } from "@/lib/survivor-mvp";
import { syncXpLevel } from "@/lib/survivor-mvp";

export const XP_QUICK_EXPLORE = 5;
export const XP_MAP_COLLECT = 10;
export const XP_CHALLENGE_CONTRIBUTE = 15;
export const XP_CHALLENGE_COMPLETE_BONUS = 50;

export const ACHIEVEMENT_IDS = {
  firstSteps: "first-steps",
  fireStarter: "fire-starter",
  tribeBuilder: "tribe-builder",
  idolHunter: "idol-hunter",
  survivorSaver: "survivor-saver",
  islandRegular: "island-regular",
} as const;

export type AchievementId =
  (typeof ACHIEVEMENT_IDS)[keyof typeof ACHIEVEMENT_IDS];

type AchievementDef = {
  id: AchievementId;
  title: string;
  description: string;
};

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: ACHIEVEMENT_IDS.firstSteps,
    title: "First Steps",
    description: "Collected your first item on the island map.",
  },
  {
    id: ACHIEVEMENT_IDS.fireStarter,
    title: "Fire Starter",
    description: "Contributed your first material to the tribe challenge.",
  },
  {
    id: ACHIEVEMENT_IDS.tribeBuilder,
    title: "Tribe Builder",
    description: "Completed your first tribe challenge.",
  },
  {
    id: ACHIEVEMENT_IDS.idolHunter,
    title: "Idol Hunter",
    description: "Found a Hidden Immunity Idol.",
  },
  {
    id: ACHIEVEMENT_IDS.survivorSaver,
    title: "Survivor Saver",
    description: "Collected 10 Survivor Coins.",
  },
  {
    id: ACHIEVEMENT_IDS.islandRegular,
    title: "Island Regular",
    description: "Reached a 3-day daily streak.",
  },
];

export function hasAchievement(game: GameState, id: AchievementId): boolean {
  return game.achievements.includes(id);
}

export function unlockAchievement(
  game: GameState,
  id: AchievementId,
): GameState {
  if (hasAchievement(game, id)) return game;
  return { ...game, achievements: [...game.achievements, id] };
}

export type AchievementRow = AchievementDef & { unlocked: boolean };

export function getAchievementList(game: GameState): AchievementRow[] {
  return ACHIEVEMENT_DEFS.map((def) => ({
    ...def,
    unlocked: hasAchievement(game, def.id),
  }));
}

/** Experience toward next level: remainder in current level bracket (0–99). */
export function xpIntoCurrentLevel(xp: number): number {
  return xp % 100;
}

export function xpToNextLevelDisplay(xp: number): string {
  const into = xpIntoCurrentLevel(xp);
  const need = 100 - into;
  return `${into} / 100 toward next level`;
}

export function addXp(game: GameState, amount: number): GameState {
  const xp = Math.max(0, game.xp + amount);
  return syncXpLevel({ ...game, xp });
}

export function todayLocalYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdAddDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Run when opening /play. Updates streak and lastPlayedDate; unlocks Island Regular at 3 days.
 */
export function applyDailyStreakOnPlay(game: GameState): GameState {
  const today = todayLocalYMD();

  if (game.lastPlayedDate === today) {
    return syncXpLevel(game);
  }

  let dailyStreak = game.dailyStreak;
  let lastPlayedDate = today;

  if (game.lastPlayedDate === null) {
    dailyStreak = 1;
  } else {
    const yesterday = ymdAddDays(today, -1);
    if (game.lastPlayedDate === yesterday) {
      dailyStreak = game.dailyStreak + 1;
    } else {
      dailyStreak = 1;
    }
  }

  let next: GameState = {
    ...game,
    dailyStreak,
    lastPlayedDate,
  };
  next = syncXpLevel(next);

  if (next.dailyStreak >= 3) {
    next = unlockAchievement(next, ACHIEVEMENT_IDS.islandRegular);
  }

  return next;
}

/** After a successful map collect (inventory already updated). */
export function applyMapCollectProgression(
  gameAfterCollect: GameState,
  item: MapItem,
): GameState {
  let g = addXp(gameAfterCollect, XP_MAP_COLLECT);

  if (!hasAchievement(g, ACHIEVEMENT_IDS.firstSteps)) {
    g = unlockAchievement(g, ACHIEVEMENT_IDS.firstSteps);
  }

  if (item.type === "idol") {
    g = unlockAchievement(g, ACHIEVEMENT_IDS.idolHunter);
  }

  if (g.coins >= 10) {
    g = unlockAchievement(g, ACHIEVEMENT_IDS.survivorSaver);
  }

  return syncXpLevel(g);
}

export function formatMapCollectToastWithXp(item: MapItem): string {
  return `${formatCollectToast(item)} +${XP_MAP_COLLECT} XP.`;
}

export type ChallengeProgressionResult = {
  game: GameState;
  /** XP fragments like "+15 XP" */
  xpParts: string[];
};

/**
 * Apply XP and achievements after a successful tribe challenge contribution.
 * `prevContributed` = contributedAmount before this action.
 */
export function applyChallengeContributionProgression(
  game: GameState,
  goalType: ChallengeGoalType,
  prevContributed: number,
  justCompleted: boolean,
): ChallengeProgressionResult {
  const xpParts: string[] = [];
  let g = addXp(game, XP_CHALLENGE_CONTRIBUTE);
  xpParts.push(`+${XP_CHALLENGE_CONTRIBUTE} XP`);

  if (
    goalType === "materials" &&
    prevContributed === 0 &&
    !hasAchievement(g, ACHIEVEMENT_IDS.fireStarter)
  ) {
    g = unlockAchievement(g, ACHIEVEMENT_IDS.fireStarter);
  }

  if (justCompleted) {
    g = addXp(g, XP_CHALLENGE_COMPLETE_BONUS);
    xpParts.push(`+${XP_CHALLENGE_COMPLETE_BONUS} XP`);
    g = unlockAchievement(g, ACHIEVEMENT_IDS.tribeBuilder);
  }

  return { game: syncXpLevel(g), xpParts };
}

export function formatContributeLine(
  goalType: ChallengeGoalType,
): string {
  const noun: Record<ChallengeGoalType, string> = {
    food: "food",
    water: "water",
    materials: "material",
    coins: "Survivor Coin",
  };
  return `You contributed 1 ${noun[goalType]}.`;
}
