import type { ItemRarity, MapItem } from "@/lib/map-items";
import type { BagRarity, BagResourceType } from "@/lib/survivor-mvp";

const BASE = "/map-icons";

/** Quick Explore find ids — kept in sync with EXPLORE_FINDS in survivor-mvp. */
export function bagEntryFromQuickExploreFind(found: {
  id: string;
  title: string;
}): {
  name: string;
  type: BagResourceType;
  icon: string;
  rarity: BagRarity;
  quantity: number;
} {
  const rarity: BagRarity = "common";
  switch (found.id) {
    case "banana":
      return {
        name: found.title,
        type: "food",
        icon: `${BASE}/banana.png`,
        rarity,
        quantity: 1,
      };
    case "coconut":
      return {
        name: found.title,
        type: "food",
        icon: `${BASE}/apple.png`,
        rarity,
        quantity: 1,
      };
    case "water":
      return {
        name: found.title,
        type: "water",
        icon: `${BASE}/water.png`,
        rarity,
        quantity: 1,
      };
    case "bamboo":
      return {
        name: found.title,
        type: "material",
        icon: `${BASE}/knife.png`,
        rarity,
        quantity: 1,
      };
    case "rope":
      return {
        name: found.title,
        type: "material",
        icon: `${BASE}/boots.png`,
        rarity,
        quantity: 1,
      };
    case "coin":
      return {
        name: found.title,
        type: "coin",
        icon: `${BASE}/coin.png`,
        rarity,
        quantity: 1,
      };
    default:
      return {
        name: found.title,
        type: "food",
        icon: `${BASE}/rice.png`,
        rarity,
        quantity: 1,
      };
  }
}

/** Stable URL for the Leaflet marker image for this map item. */
export function getMapItemIconSrc(item: MapItem): string {
  switch (item.type) {
    case "idol":
      return `${BASE}/medical-kit.png`;
    case "clue":
      return `${BASE}/compass.png`;
    case "coin":
      return `${BASE}/coin.png`;
    case "water":
      return `${BASE}/water.png`;
    case "food":
      if (item.variant === "Banana") return `${BASE}/banana.png`;
      if (item.variant === "Coconut") return `${BASE}/apple.png`;
      return `${BASE}/rice.png`;
    case "material":
      if (item.variant === "Bamboo") return `${BASE}/knife.png`;
      if (item.variant === "Rope") return `${BASE}/boots.png`;
      return `${BASE}/toilet-paper.png`;
    default:
      return `${BASE}/rice.png`;
  }
}

export function mapItemIconLayout(rarity: ItemRarity): {
  iconSize: [number, number];
  iconAnchor: [number, number];
  popupAnchor: [number, number];
} {
  const h = rarity === "rare" ? 44 : rarity === "uncommon" ? 40 : 36;
  const w = h;
  return {
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h],
  };
}
