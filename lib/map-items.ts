import { getMapItemIconSrc } from "@/lib/map-marker-icons";
import {
  MAP_COLLECT_ENERGY_COST,
  addOrIncrementBag,
  type BagResourceType,
  type GameState,
} from "@/lib/survivor-mvp";

/** Cape Town — used when geolocation is unavailable */
export const MAP_FALLBACK_LAT = -33.9249;
export const MAP_FALLBACK_LNG = 18.4241;

export const MAP_ITEMS_STORAGE_KEY = "survivor-go-map-items";
/** Regenerate spawns after this many ms (optional persistence) */
export const MAP_ITEMS_TTL_MS = 45 * 60 * 1000;

/** Player must be within this distance (m) to collect */
export const MAP_COLLECT_RADIUS_M = 40;

export type ItemRarity = "common" | "uncommon" | "rare";

export type MapResourceType =
  | "food"
  | "water"
  | "material"
  | "coin"
  | "idol"
  | "clue";

export type MapItem = {
  id: string;
  type: MapResourceType;
  /** Display name */
  variant: string;
  rarity: ItemRarity;
  lat: number;
  lng: number;
};

export type PersistedMapPayload = {
  savedAt: number;
  centerLat: number;
  centerLng: number;
  items: MapItem[];
};

const VARIANT_POOL: { type: MapResourceType; variant: string }[] = [
  { type: "food", variant: "Banana" },
  { type: "food", variant: "Coconut" },
  { type: "water", variant: "Fresh water" },
  { type: "material", variant: "Bamboo" },
  { type: "material", variant: "Rope" },
  { type: "coin", variant: "Survivor Coin" },
];

/** Haversine distance in meters (WGS84) */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Meters offset from origin using bearing (deg) and ground distance (m). */
export function offsetFromLatLng(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceM: number,
): { lat: number; lng: number } {
  const R = 6378137;
  const brng = (bearingDeg * Math.PI) / 180;
  const d = distanceM / R;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(brng),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(φ1),
      Math.cos(d) - Math.sin(φ1) * Math.sin(φ2),
    );
  return { lat: (φ2 * 180) / Math.PI, lng: (λ2 * 180) / Math.PI };
}

function newItemId(i: number): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `map-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`;
}

function rollStandardRarity(type: MapResourceType): ItemRarity {
  if (type === "coin") return "rare";
  return Math.random() < 0.55 ? "common" : "uncommon";
}

/** 100–300 m from center — idols/clues and variant pool (testing pickup stays far). */
function rollFarMapItem(
  centerLat: number,
  centerLng: number,
  i: number,
): MapItem {
  const bearing = Math.random() * 360;
  const dist = 100 + Math.random() * 200;
  const { lat, lng } = offsetFromLatLng(centerLat, centerLng, bearing, dist);
  const u = Math.random();

  if (u < 0.03) {
    return {
      id: newItemId(i),
      type: "idol",
      variant: "Hidden Immunity Idol",
      rarity: "rare",
      lat,
      lng,
    };
  }
  if (u < 0.08) {
    return {
      id: newItemId(i),
      type: "clue",
      variant: "Advantage Clue",
      rarity: "rare",
      lat,
      lng,
    };
  }

  const pick =
    VARIANT_POOL[Math.floor(Math.random() * VARIANT_POOL.length)]!;
  return {
    id: newItemId(i),
    type: pick.type,
    variant: pick.variant,
    rarity: rollStandardRarity(pick.type),
    lat,
    lng,
  };
}

/** Guaranteed reachable test pickup: ~10–20 m from spawn center. */
function createNearbyGuaranteedCoconut(
  centerLat: number,
  centerLng: number,
  index: number,
): MapItem {
  const bearing = Math.random() * 360;
  const dist = 10 + Math.random() * 10;
  const { lat, lng } = offsetFromLatLng(centerLat, centerLng, bearing, dist);
  return {
    id: newItemId(index),
    type: "food",
    variant: "Coconut",
    rarity: "common",
    lat,
    lng,
  };
}

/**
 * One Coconut (food, common) 10–20 m from the player — same rules as the first
 * generated item. For dev “spawn nearby” on /map.
 */
export function createNearbyTestMapItem(
  playerLat: number,
  playerLng: number,
): MapItem {
  const bearing = Math.random() * 360;
  const dist = 10 + Math.random() * 10;
  const { lat, lng } = offsetFromLatLng(playerLat, playerLng, bearing, dist);
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `map-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {
    id,
    type: "food",
    variant: "Coconut",
    rarity: "common",
    lat,
    lng,
  };
}

export function generateMapItems(
  centerLat: number,
  centerLng: number,
  count: number,
): MapItem[] {
  const n = Math.min(10, Math.max(5, count));
  const items: MapItem[] = [];
  items.push(createNearbyGuaranteedCoconut(centerLat, centerLng, 0));
  for (let i = 1; i < n; i++) {
    items.push(rollFarMapItem(centerLat, centerLng, i));
  }
  return items;
}

function normalizePersistedItem(raw: unknown): MapItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  const id = typeof o.id === "string" ? o.id : null;
  const type = o.type as MapResourceType;
  const variant = typeof o.variant === "string" ? o.variant : null;
  if (!id || !variant || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  const validTypes: MapResourceType[] = [
    "food",
    "water",
    "material",
    "coin",
    "idol",
    "clue",
  ];
  if (!validTypes.includes(type)) return null;
  let rarity = o.rarity as ItemRarity;
  if (rarity !== "common" && rarity !== "uncommon" && rarity !== "rare") {
    rarity = type === "coin" ? "rare" : "common";
  }
  return { id, type, variant, rarity, lat, lng };
}

export function loadPersistedMapState(): PersistedMapPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MAP_ITEMS_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedMapPayload;
    if (
      typeof data.savedAt !== "number" ||
      !Array.isArray(data.items) ||
      typeof data.centerLat !== "number" ||
      typeof data.centerLng !== "number"
    ) {
      return null;
    }
    const items = data.items
      .map((x) => normalizePersistedItem(x))
      .filter((x): x is MapItem => x != null);
    return { ...data, items };
  } catch {
    return null;
  }
}

export function savePersistedMapState(payload: PersistedMapPayload): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MAP_ITEMS_STORAGE_KEY, JSON.stringify(payload));
}

export function clearPersistedMapState(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MAP_ITEMS_STORAGE_KEY);
}

function mapTypeToBagType(t: MapResourceType): BagResourceType {
  if (t === "material") return "material";
  return t;
}

export function applyMapItemCollect(
  state: GameState,
  item: MapItem,
): GameState | null {
  if (state.energy < MAP_COLLECT_ENERGY_COST) return null;
  let next: GameState = {
    ...state,
    energy: state.energy - MAP_COLLECT_ENERGY_COST,
  };
  switch (item.type) {
    case "food":
      next = { ...next, food: next.food + 1 };
      break;
    case "water":
      next = { ...next, water: next.water + 1 };
      break;
    case "material":
      next = { ...next, materials: next.materials + 1 };
      break;
    case "coin":
      next = { ...next, coins: next.coins + 1 };
      break;
    case "idol":
      next = { ...next, idols: next.idols + 1 };
      break;
    case "clue":
      next = { ...next, clues: next.clues + 1 };
      break;
    default:
      return null;
  }
  return addOrIncrementBag(next, {
    name: item.variant,
    type: mapTypeToBagType(item.type),
    icon: getMapItemIconSrc(item),
    rarity: item.rarity,
    quantity: 1,
  });
}

export function collectRewardLabel(item: MapItem): string {
  switch (item.type) {
    case "food":
      return "+1 Food";
    case "water":
      return "+1 Water";
    case "material":
      return "+1 Material";
    case "coin":
      return "+1 Survivor Coin";
    case "idol":
      return "+1 Hidden Immunity Idol";
    case "clue":
      return "+1 Advantage Clue";
    default:
      return "+1";
  }
}

/** Toast line: rarity, name, reward */
export function formatCollectToast(item: MapItem): string {
  return `You found a ${item.rarity} ${item.variant}. ${collectRewardLabel(item)}.`;
}

export const MAP_MARKER_STYLES: Record<
  MapResourceType,
  { stroke: string; fill: string }
> = {
  food: { stroke: "#166534", fill: "#22c55e" },
  water: { stroke: "#1e40af", fill: "#3b82f6" },
  material: { stroke: "#78350f", fill: "#b45309" },
  coin: { stroke: "#a16207", fill: "#eab308" },
  idol: { stroke: "#6b21a8", fill: "#a855f7" },
  clue: { stroke: "#86198f", fill: "#e879f9" },
};

export function markerRadiusForRarity(rarity: ItemRarity): number {
  if (rarity === "rare") return 12;
  if (rarity === "uncommon") return 10;
  return 9;
}
