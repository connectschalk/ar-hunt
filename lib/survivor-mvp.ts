export const GAME_STORAGE_KEY = "survivor-go-game";

/** ISO timestamp of last local save for cloud merge / energy freshness */
export const GAME_LOCAL_UPDATED_AT_KEY = "survivor-go-game-local-updated-at";

export type BagResourceType =
  | "food"
  | "water"
  | "material"
  | "coin"
  | "idol"
  | "clue";

export type BagRarity = "common" | "uncommon" | "rare";

export type BagItem = {
  id: string;
  name: string;
  type: BagResourceType;
  /** Public URL under /public, e.g. /map-icons/banana.png */
  icon: string;
  rarity: BagRarity;
  quantity: number;
};

/** Matches weekly tribe challenge resource categories (localStorage). */
export type TribeBagDeductionGoal =
  | "food"
  | "water"
  | "materials"
  | "coins";

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
  /** Stacked inventory rows for UI and tribe contributions */
  bag: BagItem[];
  /** Total XP; level derived as Math.floor(xp / 100) + 1 */
  xp: number;
  /** Cached from xp; kept in sync via syncXpLevel */
  level: number;
  dailyStreak: number;
  /** Local calendar date YYYY-MM-DD of last /play visit */
  lastPlayedDate: string | null;
  /** Unlocked achievement ids */
  achievements: string[];
};

export const DEFAULT_GAME_STATE: GameState = {
  energy: 100,
  food: 0,
  water: 0,
  materials: 0,
  coins: 0,
  idols: 0,
  clues: 0,
  bag: [],
  xp: 0,
  level: 1,
  dailyStreak: 0,
  lastPlayedDate: null,
  achievements: [],
};

export function syncXpLevel(game: GameState): GameState {
  const level = Math.floor(game.xp / 100) + 1;
  return { ...game, level };
}

export function makeBagStackId(
  type: BagResourceType,
  name: string,
  rarity: BagRarity,
): string {
  return `bag:${type}:${name}:${rarity}`;
}

/** Merge into an existing stack when id matches (same item name + type + rarity). */
export function addOrIncrementBag(
  game: GameState,
  item: {
    name: string;
    type: BagResourceType;
    icon: string;
    rarity: BagRarity;
    quantity?: number;
  },
): GameState {
  const quantity = item.quantity ?? 1;
  const id = makeBagStackId(item.type, item.name, item.rarity);
  const idx = game.bag.findIndex((b) => b.id === id);
  if (idx === -1) {
    return {
      ...game,
      bag: [
        ...game.bag,
        {
          id,
          name: item.name,
          type: item.type,
          icon: item.icon,
          rarity: item.rarity,
          quantity,
        },
      ],
    };
  }
  const row = game.bag[idx]!;
  const nextBag = [...game.bag];
  nextBag[idx] = { ...row, quantity: row.quantity + quantity };
  return { ...game, bag: nextBag };
}

function tribeGoalToBagType(goal: TribeBagDeductionGoal): BagResourceType | null {
  switch (goal) {
    case "food":
      return "food";
    case "water":
      return "water";
    case "materials":
      return "material";
    case "coins":
      return "coin";
    default:
      return null;
  }
}

/**
 * Removes one unit from the first matching bag stack (deterministic order).
 * Safe when legacy totals exist without bag rows: leaves bag unchanged.
 */
export function subtractOneFromBagForGoal(
  game: GameState,
  goal: TribeBagDeductionGoal,
): GameState {
  const target = tribeGoalToBagType(goal);
  if (!target) return game;

  const sorted = [...game.bag].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.name.localeCompare(b.name);
  });

  let foundIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!;
    if (row.type === target && row.quantity > 0) {
      foundIdx = i;
      break;
    }
  }
  if (foundIdx === -1) return game;

  const row = sorted[foundIdx]!;
  const nextQty = row.quantity - 1;
  const replacement =
    nextQty <= 0
      ? []
      : [{ ...row, quantity: Math.max(0, nextQty) }];

  const without = sorted.filter((_, i) => i !== foundIdx);
  return { ...game, bag: [...without, ...replacement] };
}

const VALID_BAG_TYPES = new Set<BagResourceType>([
  "food",
  "water",
  "material",
  "coin",
  "idol",
  "clue",
]);

const VALID_BAG_RARITY = new Set<BagRarity>(["common", "uncommon", "rare"]);

/** Validate bag JSON from DB or localStorage */
export function normalizeBagArray(raw: unknown): BagItem[] {
  if (!Array.isArray(raw)) return [];
  const out: BagItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const name = typeof o.name === "string" ? o.name : "";
    const type = o.type as BagResourceType;
    const icon = typeof o.icon === "string" ? o.icon : "";
    const rarity = o.rarity as BagRarity;
    const quantity = Math.max(0, Math.floor(Number(o.quantity) || 0));
    if (
      !id ||
      !name ||
      !VALID_BAG_TYPES.has(type) ||
      !icon ||
      !VALID_BAG_RARITY.has(rarity) ||
      quantity < 1
    ) {
      continue;
    }
    out.push({ id, name, type, icon, rarity, quantity });
  }
  return out;
}

function synthesizeBagFromTotals(g: GameState): BagItem[] {
  const items: BagItem[] = [];
  if (g.food > 0) {
    const rarity: BagRarity = "common";
    const name = "Food";
    items.push({
      id: makeBagStackId("food", name, rarity),
      name,
      type: "food",
      icon: "/map-icons/rice.png",
      rarity,
      quantity: g.food,
    });
  }
  if (g.water > 0) {
    const rarity: BagRarity = "common";
    const name = "Water";
    items.push({
      id: makeBagStackId("water", name, rarity),
      name,
      type: "water",
      icon: "/map-icons/water.png",
      rarity,
      quantity: g.water,
    });
  }
  if (g.materials > 0) {
    const rarity: BagRarity = "common";
    const name = "Materials";
    items.push({
      id: makeBagStackId("material", name, rarity),
      name,
      type: "material",
      icon: "/map-icons/toilet-paper.png",
      rarity,
      quantity: g.materials,
    });
  }
  if (g.coins > 0) {
    const rarity: BagRarity = "common";
    const name = "Survivor Coin";
    items.push({
      id: makeBagStackId("coin", name, rarity),
      name,
      type: "coin",
      icon: "/map-icons/coin.png",
      rarity,
      quantity: g.coins,
    });
  }
  if (g.idols > 0) {
    const rarity: BagRarity = "rare";
    const name = "Hidden Immunity Idol";
    items.push({
      id: makeBagStackId("idol", name, rarity),
      name,
      type: "idol",
      icon: "/map-icons/medical-kit.png",
      rarity,
      quantity: g.idols,
    });
  }
  if (g.clues > 0) {
    const rarity: BagRarity = "rare";
    const name = "Advantage Clue";
    items.push({
      id: makeBagStackId("clue", name, rarity),
      name,
      type: "clue",
      icon: "/map-icons/compass.png",
      rarity,
      quantity: g.clues,
    });
  }
  return items;
}

export const TRIBE_STORAGE_KEY = "survivor-go-tribe-name";
export const TRIBE_ID_STORAGE_KEY = "survivor-go-tribe-id";

/** Dispatched when tribe name/id in localStorage changes (any source). */
export function notifyTribeStorageUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("survivor-go-tribe-updated"));
}

export function loadGameState(): GameState {
  if (typeof window === "undefined") return { ...DEFAULT_GAME_STATE };
  try {
    const raw = window.localStorage.getItem(GAME_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GAME_STATE };
    const parsed = JSON.parse(raw) as Partial<GameState>;
    const xp = Math.max(0, Number(parsed.xp) || 0);
    const achievements = Array.isArray(parsed.achievements)
      ? parsed.achievements.filter((a): a is string => typeof a === "string")
      : [];
    const base: GameState = {
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
      bag: [],
      xp,
      level: 1,
      dailyStreak: Math.max(0, Number(parsed.dailyStreak) || 0),
      lastPlayedDate:
        typeof parsed.lastPlayedDate === "string"
          ? parsed.lastPlayedDate
          : null,
      achievements,
    };

    let bag = normalizeBagArray(parsed.bag);
    if (bag.length === 0) {
      const hasTotals =
        base.food > 0 ||
        base.water > 0 ||
        base.materials > 0 ||
        base.coins > 0 ||
        base.idols > 0 ||
        base.clues > 0;
      if (hasTotals) {
        bag = synthesizeBagFromTotals(base);
      }
    }

    return syncXpLevel({ ...base, bag });
  } catch {
    return { ...DEFAULT_GAME_STATE };
  }
}

export function touchLocalGameStateUpdatedAt(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      GAME_LOCAL_UPDATED_AT_KEY,
      new Date().toISOString(),
    );
  } catch {
    /* ignore */
  }
}

export function getLocalGameStateUpdatedAtMs(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(GAME_LOCAL_UPDATED_AT_KEY);
    if (!raw) return 0;
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

export function saveGameState(state: GameState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(state));
  touchLocalGameStateUpdatedAt();
  void import("@/lib/supabase/player-state").then((m) => {
    m.queueRemotePlayerStateUpsert(state).catch(() => {
      /* logged inside */
    });
  });
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

/** Device-only tribe label; clears any synced Supabase tribe id. */
export function saveTribeName(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRIBE_STORAGE_KEY, name.trim());
    window.localStorage.removeItem(TRIBE_ID_STORAGE_KEY);
    notifyTribeStorageUpdated();
  } catch {
    /* ignore */
  }
}

/** Persist tribe label and Supabase tribe id (logged-in / cloud sync). */
export function saveTribeToDevice(name: string, tribeId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRIBE_STORAGE_KEY, name.trim());
    window.localStorage.setItem(TRIBE_ID_STORAGE_KEY, tribeId);
    notifyTribeStorageUpdated();
  } catch {
    /* ignore */
  }
}

export function loadTribeId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(TRIBE_ID_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
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
