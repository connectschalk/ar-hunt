import {
  addOrIncrementBag,
  subtractOneFromBagForGoal,
  type GameState,
} from "@/lib/survivor-mvp";

export const TRIBE_CHALLENGE_STORAGE_KEY = "survivor-go-challenge";

export type ChallengeGoalType = "food" | "water" | "materials" | "coins";

export type TribeChallengeState = {
  challengeName: string;
  goalType: ChallengeGoalType;
  targetAmount: number;
  contributedAmount: number;
  completed: boolean;
  rewardCoins: number;
  /** Prevents granting reward more than once */
  rewardClaimed: boolean;
};

export const DEFAULT_TRIBE_CHALLENGE: TribeChallengeState = {
  challengeName: "Build the Tribe Fire",
  goalType: "materials",
  targetAmount: 10,
  contributedAmount: 0,
  completed: false,
  rewardCoins: 5,
  rewardClaimed: false,
};

export function goalTypeLabel(t: ChallengeGoalType): string {
  switch (t) {
    case "food":
      return "Food";
    case "water":
      return "Water";
    case "materials":
      return "Materials";
    case "coins":
      return "Survivor Coins";
    default:
      return t;
  }
}

export function goalDescription(challenge: TribeChallengeState): string {
  return `Goal: contribute ${challenge.targetAmount} ${goalTypeLabel(challenge.goalType).toLowerCase()} for “${challenge.challengeName}”.`;
}

function resourceCount(game: GameState, goal: ChallengeGoalType): number {
  switch (goal) {
    case "food":
      return game.food;
    case "water":
      return game.water;
    case "materials":
      return game.materials;
    case "coins":
      return game.coins;
    default:
      return 0;
  }
}

function subtractOneResource(
  game: GameState,
  goal: ChallengeGoalType,
): GameState {
  switch (goal) {
    case "food":
      return { ...game, food: Math.max(0, game.food - 1) };
    case "water":
      return { ...game, water: Math.max(0, game.water - 1) };
    case "materials":
      return { ...game, materials: Math.max(0, game.materials - 1) };
    case "coins":
      return { ...game, coins: Math.max(0, game.coins - 1) };
    default:
      return game;
  }
}

export function loadTribeChallenge(): TribeChallengeState {
  if (typeof window === "undefined") return { ...DEFAULT_TRIBE_CHALLENGE };
  try {
    const raw = window.localStorage.getItem(TRIBE_CHALLENGE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TRIBE_CHALLENGE };
    const p = JSON.parse(raw) as Partial<TribeChallengeState>;
    const goalType = p.goalType as ChallengeGoalType;
    const validGoals: ChallengeGoalType[] = [
      "food",
      "water",
      "materials",
      "coins",
    ];
    return {
      challengeName:
        typeof p.challengeName === "string"
          ? p.challengeName
          : DEFAULT_TRIBE_CHALLENGE.challengeName,
      goalType: validGoals.includes(goalType)
        ? goalType
        : DEFAULT_TRIBE_CHALLENGE.goalType,
      targetAmount: Math.max(
        1,
        Number(p.targetAmount) || DEFAULT_TRIBE_CHALLENGE.targetAmount,
      ),
      contributedAmount: Math.max(
        0,
        Number(p.contributedAmount) || 0,
      ),
      completed: Boolean(p.completed),
      rewardCoins: Math.max(
        0,
        Number(p.rewardCoins) || DEFAULT_TRIBE_CHALLENGE.rewardCoins,
      ),
      rewardClaimed: Boolean(p.rewardClaimed),
    };
  } catch {
    return { ...DEFAULT_TRIBE_CHALLENGE };
  }
}

export function saveTribeChallenge(c: TribeChallengeState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRIBE_CHALLENGE_STORAGE_KEY, JSON.stringify(c));
}

export function playerCanContribute(
  game: GameState,
  challenge: TribeChallengeState,
): boolean {
  if (challenge.completed) return false;
  return resourceCount(game, challenge.goalType) >= 1;
}

export type ContributeResult = {
  game: GameState;
  challenge: TribeChallengeState;
  /** Shown when challenge just completed and reward granted */
  completionMessage: string | null;
};

/**
 * Removes 1 of the goal resource, increments progress, grants reward once when target met.
 */
export function contributeOneToChallenge(
  game: GameState,
  challenge: TribeChallengeState,
): ContributeResult | null {
  if (challenge.completed) return null;
  if (resourceCount(game, challenge.goalType) < 1) return null;

  let nextGame = subtractOneResource(game, challenge.goalType);
  nextGame = subtractOneFromBagForGoal(nextGame, challenge.goalType);
  let nextChallenge: TribeChallengeState = {
    ...challenge,
    contributedAmount: challenge.contributedAmount + 1,
  };

  let completionMessage: string | null = null;

  if (nextChallenge.contributedAmount >= nextChallenge.targetAmount) {
    nextChallenge.completed = true;
    if (!nextChallenge.rewardClaimed) {
      const reward = nextChallenge.rewardCoins;
      nextGame = {
        ...nextGame,
        coins: nextGame.coins + reward,
      };
      nextGame = addOrIncrementBag(nextGame, {
        name: "Survivor Coin",
        type: "coin",
        icon: "/map-icons/coin.png",
        rarity: "common",
        quantity: reward,
      });
      nextChallenge.rewardClaimed = true;
      completionMessage = `Challenge completed. Your tribe earned ${nextChallenge.rewardCoins} Survivor Coins.`;
    }
  }

  return { game: nextGame, challenge: nextChallenge, completionMessage };
}
