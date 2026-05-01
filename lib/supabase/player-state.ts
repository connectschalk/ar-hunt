import { getCurrentUser } from "@/lib/supabase/auth";
import { createBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  notifyCloudSaveFailed,
  notifyCloudSaveOk,
} from "@/lib/cloud-save-status";
import type { BagItem, GameState } from "@/lib/survivor-mvp";
import {
  getLocalGameStateUpdatedAtMs,
  loadGameState,
  makeBagStackId,
  normalizeBagArray,
  saveGameState,
  syncXpLevel,
  touchLocalGameStateUpdatedAt,
} from "@/lib/survivor-mvp";

/** Row shape from public.player_state (snake_case from PostgREST). */
export type RemotePlayerStateRow = {
  id: string;
  user_id: string;
  energy: number;
  food: number;
  water: number;
  materials: number;
  coins: number;
  idols: number;
  clues: number;
  xp: number;
  level: number;
  daily_streak: number;
  last_played_date: string | null;
  achievements: string[] | null;
  bag: unknown;
  updated_at: string;
};

function clampEnergy(n: number): number {
  return Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
}

function bagMergeKey(item: Pick<BagItem, "type" | "name" | "rarity">): string {
  return `${item.type}\0${item.name}\0${item.rarity}`;
}

/** Per stack: keep the higher quantity (same rule as numeric stats). */
export function mergeBagByMaxQuantity(a: BagItem[], b: BagItem[]): BagItem[] {
  const map = new Map<string, BagItem>();
  for (const row of [...a, ...b]) {
    const k = bagMergeKey(row);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...row });
      continue;
    }
    const qty = Math.max(prev.quantity, row.quantity);
    const icon =
      row.quantity >= prev.quantity ? row.icon : prev.icon;
    map.set(k, {
      ...prev,
      id: makeBagStackId(row.type, row.name, row.rarity),
      quantity: qty,
      icon,
    });
  }
  return [...map.values()].filter((x) => x.quantity > 0);
}

function mergeAchievements(a: string[], b: string[] | null | undefined): string[] {
  const set = new Set<string>([...a, ...(b ?? [])]);
  return [...set].sort();
}

function latestDate(
  a: string | null,
  b: string | null,
): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * Merge local and remote snapshots. Energy uses remote only when remote.updated_at
 * is newer than the local save timestamp; otherwise local energy wins.
 */
export function mergeGameStates(
  local: GameState,
  remote: RemotePlayerStateRow,
  localUpdatedAtMs: number,
): GameState {
  const remoteMs = Date.parse(remote.updated_at);
  const remoteNewer =
    Number.isFinite(remoteMs) && remoteMs > localUpdatedAtMs;

  const remoteBag = normalizeBagArray(remote.bag);
  const mergedBag = mergeBagByMaxQuantity(local.bag, remoteBag);

  const energy = remoteNewer
    ? clampEnergy(remote.energy)
    : local.energy;

  let merged: GameState = {
    energy,
    food: Math.max(local.food, remote.food ?? 0),
    water: Math.max(local.water, remote.water ?? 0),
    materials: Math.max(local.materials, remote.materials ?? 0),
    coins: Math.max(local.coins, remote.coins ?? 0),
    idols: Math.max(local.idols, remote.idols ?? 0),
    clues: Math.max(local.clues, remote.clues ?? 0),
    xp: Math.max(local.xp, remote.xp ?? 0),
    level: Math.max(local.level, remote.level ?? 1),
    dailyStreak: Math.max(local.dailyStreak, remote.daily_streak ?? 0),
    lastPlayedDate: latestDate(
      local.lastPlayedDate,
      remote.last_played_date,
    ),
    achievements: mergeAchievements(
      local.achievements,
      remote.achievements,
    ),
    bag: mergedBag,
  };
  merged = syncXpLevel(merged);
  return merged;
}

export async function getRemotePlayerState(
  userId: string,
): Promise<RemotePlayerStateRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createBrowserClient();
  const { data, error } = await supabase
    .from("player_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as RemotePlayerStateRow;
}

export async function upsertRemotePlayerState(
  userId: string,
  game: GameState,
): Promise<Error | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createBrowserClient();
  const row = {
    user_id: userId,
    energy: clampEnergy(game.energy),
    food: Math.max(0, game.food),
    water: Math.max(0, game.water),
    materials: Math.max(0, game.materials),
    coins: Math.max(0, game.coins),
    idols: Math.max(0, game.idols),
    clues: Math.max(0, game.clues),
    xp: Math.max(0, game.xp),
    level: Math.max(1, game.level),
    daily_streak: Math.max(0, game.dailyStreak),
    last_played_date: game.lastPlayedDate,
    achievements: game.achievements,
    bag: game.bag,
  };

  const { error } = await supabase.from("player_state").upsert(row, {
    onConflict: "user_id",
  });

  return error ?? null;
}

export async function syncLocalToRemote(userId: string): Promise<void> {
  const local = loadGameState();
  const err = await upsertRemotePlayerState(userId, local);
  if (err) throw err;
}

export async function syncRemoteToLocal(userId: string): Promise<void> {
  const remote = await getRemotePlayerState(userId);
  if (!remote) return;
  const local = loadGameState();
  const localMs = getLocalGameStateUpdatedAtMs();
  const merged = mergeGameStates(local, remote, localMs);
  saveGameState(merged);
}

/**
 * After login / session restore: upload local-only progress, or merge cloud + device.
 */
export async function runSessionPlayerStateSync(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    const remote = await getRemotePlayerState(userId);

    if (!remote) {
      const local = loadGameState();
      const err = await upsertRemotePlayerState(userId, local);
      if (err) throw err;
      touchLocalGameStateUpdatedAt();
      notifyCloudSaveOk();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("survivor-go-game-merged"));
      }
      return;
    }

    const local = loadGameState();
    const localMs = getLocalGameStateUpdatedAtMs();
    const merged = mergeGameStates(local, remote, localMs);
    saveGameState(merged);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("survivor-go-game-merged"));
    }
  } catch (e) {
    console.warn("Survivor GO: session player_state sync failed", e);
    notifyCloudSaveFailed();
  }
}

/** Fire-and-forget after local save when logged in. */
export async function queueRemotePlayerStateUpsert(
  state: GameState,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    notifyCloudSaveFailed();
    return;
  }
  if (!user) return;

  try {
    const err = await upsertRemotePlayerState(user.id, state);
    if (err) throw err;
    notifyCloudSaveOk();
  } catch (e) {
    console.warn("Survivor GO: cloud player_state sync failed", e);
    notifyCloudSaveFailed();
  }
}
