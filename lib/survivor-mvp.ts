export const GAME_STORAGE_KEY = "survivor-go-game";

export type GameState = {
  energy: number;
  food: number;
  water: number;
  materials: number;
  coins: number;
  /** Hidden Immunity Idols (map / future challenges) */
  idols: number;
  /** Advantage Clues (map / future challenges) */
  clues: number;
};

export const DEFAULT_GAME_STATE: GameState = {
  energy: 100,
  food: 0,
  water: 0,
  materials: 0,
  coins: 0,
  idols: 0,
  clues: 0,
};

export const TRIBE_STORAGE_KEY = "survivor-go-tribe-name";

export function loadGameState(): GameState {
  if (typeof window === "undefined") return { ...DEFAULT_GAME_STATE };
  try {
    const raw = window.localStorage.getItem(GAME_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GAME_STATE };
    const parsed = JSON.parse(raw) as Partial<GameState>;
    return {
      energy:
        typeof parsed.energy === "number"
          ? Math.min(100, Math.max(0, parsed.energy))
          : DEFAULT_GAME_STATE.energy,
      food: Math.max(0, Number(parsed.food) || 0),
      water: Math.max(0, Number(parsed.water) || 0),
      materials: Math.max(0, Number(parsed.materials) || 0),
      coins: Math.max(0, Number(parsed.coins) || 0),
      idols: Math.max(0, Number(parsed.idols) || 0),
      clues: Math.max(0, Number(parsed.clues) || 0),
    };
  } catch {
    return { ...DEFAULT_GAME_STATE };
  }
}

export function saveGameState(state: GameState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(state));
}

export function loadTribeName(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(TRIBE_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function saveTribeName(name: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRIBE_STORAGE_KEY, name.trim());
}

export const EXPLORE_COST = 5;

/** Energy spent when collecting an item on the island map */
export const MAP_COLLECT_ENERGY_COST = 2;

export type FindResult = {
  id: string;
  title: string;
  detail: string;
  apply: (s: GameState) => GameState;
};

export const EXPLORE_FINDS: FindResult[] = [
  {
    id: "banana",
    title: "Banana",
    detail: "+1 Food",
    apply: (s) => ({ ...s, food: s.food + 1 }),
  },
  {
    id: "coconut",
    title: "Coconut",
    detail: "+1 Food",
    apply: (s) => ({ ...s, food: s.food + 1 }),
  },
  {
    id: "water",
    title: "Fresh water",
    detail: "+1 Water",
    apply: (s) => ({ ...s, water: s.water + 1 }),
  },
  {
    id: "bamboo",
    title: "Bamboo",
    detail: "+1 Material",
    apply: (s) => ({ ...s, materials: s.materials + 1 }),
  },
  {
    id: "rope",
    title: "Rope",
    detail: "+1 Material",
    apply: (s) => ({ ...s, materials: s.materials + 1 }),
  },
  {
    id: "coin",
    title: "Survivor Coin",
    detail: "+1 Survivor Coin",
    apply: (s) => ({ ...s, coins: s.coins + 1 }),
  },
];

export function randomFind(): FindResult {
  const i = Math.floor(Math.random() * EXPLORE_FINDS.length);
  return EXPLORE_FINDS[i]!;
}
