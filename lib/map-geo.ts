import { haversineMeters } from "@/lib/map-items";
import type { MapItem } from "@/lib/map-items";

export { haversineMeters } from "@/lib/map-items";

/**
 * Initial bearing from point A to B, degrees clockwise from true north [0, 360).
 */
export function calculateBearing(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const φ1 = (fromLat * Math.PI) / 180;
  const φ2 = (toLat * Math.PI) / 180;
  const Δλ = ((toLng - fromLng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

export type Position = { lat: number; lng: number };

/** Uncollected items only; pass current item list from map state. */
export function getClosestItem(
  userPos: Position,
  items: MapItem[],
): MapItem | null {
  if (items.length === 0) return null;
  let best: MapItem | null = null;
  let bestD = Infinity;
  for (const item of items) {
    const d = haversineMeters(
      userPos.lat,
      userPos.lng,
      item.lat,
      item.lng,
    );
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  return best;
}
