import type { GameState } from "@/lib/survivor-mvp";
import { MAP_COLLECT_ENERGY_COST } from "@/lib/survivor-mvp";

/** Cape Town — used when geolocation is unavailable */
export const MAP_FALLBACK_LAT = -33.9249;
export const MAP_FALLBACK_LNG = 18.4241;

export const MAP_ITEMS_STORAGE_KEY = "survivor-go-map-items";
/** Regenerate spawns after this many ms (optional persistence) */
export const MAP_ITEMS_TTL_MS = 45 * 60 * 1000;

export type MapResourceType = "food" | "water" | "material" | "coin";

export type MapItem = {
  id: string;
  type: MapResourceType;
  /** Display name: Banana, Coconut, etc. */
  variant: string;
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

export function generateMapItems(
  centerLat: number,
  centerLng: number,
  count: number,
): MapItem[] {
  const n = Math.min(10, Math.max(5, count));
  const items: MapItem[] = [];
  for (let i = 0; i < n; i++) {
    const pick = VARIANT_POOL[Math.floor(Math.random() * VARIANT_POOL.length)]!;
    const bearing = Math.random() * 360;
    const dist = 100 + Math.random() * 200;
    const { lat, lng } = offsetFromLatLng(centerLat, centerLng, bearing, dist);
    items.push({
      id:
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `map-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
      type: pick.type,
      variant: pick.variant,
      lat,
      lng,
    });
  }
  return items;
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
    return data;
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
    default:
      return null;
  }
  return next;
}

export const MAP_MARKER_STYLES: Record<
  MapResourceType,
  { stroke: string; fill: string }
> = {
  food: { stroke: "#166534", fill: "#22c55e" },
  water: { stroke: "#1e40af", fill: "#3b82f6" },
  material: { stroke: "#78350f", fill: "#b45309" },
  coin: { stroke: "#a16207", fill: "#eab308" },
};
