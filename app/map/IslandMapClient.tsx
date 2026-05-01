"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SVGProps,
} from "react";
import type {
  CircleMarker as LeafletCircleMarker,
  Map as LeafletMap,
  Marker,
} from "leaflet";
import {
  getMapItemIconSrc,
  mapItemIconLayout,
} from "@/lib/map-marker-icons";
import {
  applyMapItemCollect,
  clearPersistedMapState,
  createNearbyTestMapItem,
  generateMapItems,
  haversineMeters,
  loadPersistedMapState,
  MAP_COLLECT_RADIUS_M,
  MAP_FALLBACK_LAT,
  MAP_FALLBACK_LNG,
  MAP_ITEMS_TTL_MS,
  savePersistedMapState,
  type MapItem,
} from "@/lib/map-items";
import { calculateBearing, getClosestItem } from "@/lib/map-geo";
import {
  formatMapCollectToastWithXp,
  applyMapCollectProgression,
  xpIntoCurrentLevel,
} from "@/lib/player-progression";
import {
  DEFAULT_GAME_STATE,
  loadGameState,
  saveGameState,
  type GameState,
} from "@/lib/survivor-mvp";
import { btnPrimarySm } from "@/lib/survivor-ui";

/** Degrees to add if compass-dial.png default orientation ≠ geographic north at 0°. */
const NEEDLE_ASSET_OFFSET = 0;

const NEEDLE_TRANSITION =
  "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)";

function normalizeDeg(d: number): number {
  const x = d % 360;
  return x < 0 ? x + 360 : x;
}

/** Continue unwrapped angle from `prev` toward `nextRaw` using shortest circular delta. */
function getShortestRotation(prev: number, nextRaw: number): number {
  const next = normalizeDeg(nextRaw);
  const prevNorm = normalizeDeg(prev);
  let delta = next - prevNorm;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return prev + delta;
}

function randomSpawnCount(): number {
  return 5 + Math.floor(Math.random() * 6);
}

function mapDevLog(...args: unknown[]) {
  if (
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "development"
  ) {
    console.log("[Survivor map]", ...args);
  }
}

function searchNewArea(
  pos: { lat: number; lng: number },
  setItems: (items: MapItem[]) => void,
) {
  mapDevLog("clear persisted map + generate new items", {
    lat: pos.lat,
    lng: pos.lng,
  });
  clearPersistedMapState();
  const generated = generateMapItems(pos.lat, pos.lng, randomSpawnCount());
  mapDevLog("generated items", generated.length);
  setItems(generated);
  savePersistedMapState({
    savedAt: Date.now(),
    centerLat: pos.lat,
    centerLng: pos.lng,
    items: generated,
  });
}

function buildItemPopupHtml(
  item: MapItem,
  distM: number | null,
  isSelected: boolean,
): string {
  const capRarity =
    item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1);
  const distLine =
    distM != null ? `${distM} m away` : "Distance: —";
  const sel =
    isSelected &&
    `<span style="display:block;margin-top:8px;color:#fcd34d;font-size:11px;font-weight:600;letter-spacing:.02em">Selected target</span>`;
  const canCollect =
    distM != null && distM <= MAP_COLLECT_RADIUS_M;
  const collectBlock = canCollect
    ? `<button type="button" data-map-collect="${item.id}" style="margin-top:10px;width:100%;padding:9px 10px;border-radius:10px;border:1px solid rgba(251,191,36,0.55);background:linear-gradient(180deg,#b45309 0%,#7c2d12 100%);color:#fffbeb;font-weight:700;font-size:12px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)">Collect</button>`
    : `<p style="margin-top:8px;opacity:.8;font-size:11px;line-height:1.35">Move within ${MAP_COLLECT_RADIUS_M} m to collect.</p>`;
  return `<div style="font-size:13px;line-height:1.45;min-width:140px">
            <strong>${item.variant}</strong><br/>
            <span style="opacity:.85">${capRarity}</span><br/>
            <span style="opacity:.9">${distLine}</span>
            ${sel || ""}
            ${collectBlock}
          </div>`;
}

function IconFilter(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        strokeWidth={2}
        strokeLinecap="round"
        d="M4 5h16M7 12h10M10 19h4"
      />
    </svg>
  );
}

function IconLocate(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="12" cy="12" r="3" strokeWidth={2} />
      <path strokeWidth={2} d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

function IconRefreshArea(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <path
        strokeWidth={2}
        strokeLinecap="round"
        d="M4 12a8 8 0 0113.657-5.657M20 12a8 8 0 01-13.657 5.657"
      />
      <path strokeWidth={2} strokeLinecap="round" d="M8 5H4V1M16 19h4v4" />
    </svg>
  );
}

function IconInfo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="12" cy="12" r="9" strokeWidth={2} />
      <path strokeWidth={2} strokeLinecap="round" d="M12 10v7M12 7h.01" />
    </svg>
  );
}

function IconCompassRose(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
      <circle cx="12" cy="12" r="9" strokeWidth={1.5} opacity={0.85} />
      <path
        fill="currentColor"
        d="M12 4l1.2 6.5L12 14l-1.2-3.5L12 4z"
        opacity={0.9}
      />
      <path
        fill="currentColor"
        d="M12 20l-1.2-6.5L12 10l1.2 3.5L12 20z"
        opacity={0.45}
      />
    </svg>
  );
}

const hudIconBtn =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-teal-500/45 bg-black/72 text-teal-50 shadow-[0_2px_14px_rgba(0,0,0,0.55),0_0_18px_rgba(251,191,36,0.18)] backdrop-blur-md transition hover:border-amber-400/55 hover:text-amber-50 hover:shadow-[0_2px_16px_rgba(0,0,0,0.5),0_0_26px_rgba(251,191,36,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 active:scale-95";

export function IslandMapClient() {
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [game, setGame] = useState<GameState>(DEFAULT_GAME_STATE);
  const [items, setItems] = useState<MapItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapItemsLoading, setMapItemsLoading] = useState(true);
  const [manualCompassTargetId, setManualCompassTargetId] = useState<
    string | null
  >(null);
  const [compassHudVisible, setCompassHudVisible] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const itemMarkersRef = useRef<Map<string, Marker>>(new Map());
  const itemsForMapRef = useRef<MapItem[]>([]);
  const userPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const collectHandlerRef = useRef<(item: MapItem) => void>(() => {});
  const hasSpawnedInitialItemsRef = useRef(false);
  const manualCompassTargetIdRef = useRef<string | null>(null);
  const mapCollectCleanupRef = useRef<(() => void) | null>(null);
  const playerMarkerRef = useRef<LeafletCircleMarker | null>(null);
  const prevRotationRef = useRef<number | null>(null);

  useEffect(() => {
    userPosRef.current = userPos;
  }, [userPos]);

  useEffect(() => {
    itemsForMapRef.current = items;
  }, [items]);

  useEffect(() => {
    manualCompassTargetIdRef.current = manualCompassTargetId;
  }, [manualCompassTargetId]);

  useEffect(() => {
    setGame(loadGameState());
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setUserPos({ lat: MAP_FALLBACK_LAT, lng: MAP_FALLBACK_LNG });
      setLocationNote("Location access improves gameplay");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocationNote(null);
      },
      () => {
        setUserPos({ lat: MAP_FALLBACK_LAT, lng: MAP_FALLBACK_LNG });
        setLocationNote("Location access improves gameplay");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20_000,
      },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!userPos || hasSpawnedInitialItemsRef.current) return;
    hasSpawnedInitialItemsRef.current = true;
    const persisted = loadPersistedMapState();
    const stillFresh =
      persisted &&
      Date.now() - persisted.savedAt < MAP_ITEMS_TTL_MS &&
      persisted.items.length > 0;

    if (stillFresh) {
      mapDevLog("loaded items from localStorage", persisted.items.length);
      setItems(persisted.items);
    } else {
      mapDevLog(
        "no valid persisted map (missing, stale, or empty) — generating",
      );
      searchNewArea(userPos, setItems);
    }
    setMapItemsLoading(false);
  }, [userPos]);

  useEffect(() => {
    if (
      manualCompassTargetId &&
      !items.some((i) => i.id === manualCompassTargetId)
    ) {
      setManualCompassTargetId(null);
    }
  }, [items, manualCompassTargetId]);

  const compassTargetItem = useMemo(() => {
    if (!userPos || items.length === 0) return null;
    if (manualCompassTargetId) {
      const found = items.find((i) => i.id === manualCompassTargetId);
      if (found) return found;
    }
    return getClosestItem(userPos, items);
  }, [userPos, items, manualCompassTargetId]);

  const compassLabel = useMemo(() => {
    if (!compassTargetItem || !userPos) return "No items to track.";
    const dist = Math.round(
      haversineMeters(
        userPos.lat,
        userPos.lng,
        compassTargetItem.lat,
        compassTargetItem.lng,
      ),
    );
    const manualActive =
      manualCompassTargetId != null &&
      items.some((i) => i.id === manualCompassTargetId) &&
      compassTargetItem.id === manualCompassTargetId;
    const prefix = manualActive ? "Target" : "Nearest item";
    return `${prefix}: ${compassTargetItem.variant} · ${dist}m`;
  }, [compassTargetItem, userPos, manualCompassTargetId, items]);

  /**
   * Bearing from blue-dot position to target spawn (recalculates every GPS tick).
   * Target = manual selection, else closest item; clears when collected / new search.
   */
  const needleRotation = useMemo(() => {
    if (!userPos || !compassTargetItem) return 0;
    return (
      calculateBearing(
        userPos.lat,
        userPos.lng,
        compassTargetItem.lat,
        compassTargetItem.lng,
      ) + NEEDLE_ASSET_OFFSET
    );
  }, [userPos, compassTargetItem]);

  /** Smooth display angle — shortest path from previous frame (no long spins). */
  let displayRotation = 0;
  if (!userPos || !compassTargetItem) {
    displayRotation = 0;
    prevRotationRef.current = null;
  } else if (prevRotationRef.current === null) {
    displayRotation = normalizeDeg(needleRotation);
    prevRotationRef.current = displayRotation;
  } else {
    displayRotation = getShortestRotation(
      prevRotationRef.current,
      needleRotation,
    );
    prevRotationRef.current = displayRotation;
  }

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const persistItems = useCallback(
    (filtered: MapItem[]) => {
      const pos = userPosRef.current;
      if (pos) {
        savePersistedMapState({
          savedAt: Date.now(),
          centerLat: pos.lat,
          centerLng: pos.lng,
          items: filtered,
        });
      }
    },
    [],
  );

  const collectItem = useCallback(
    (item: MapItem) => {
      const pos = userPosRef.current;
      if (!pos) {
        showToast("Waiting for your position…");
        return;
      }
      const dist = haversineMeters(pos.lat, pos.lng, item.lat, item.lng);
      if (dist > MAP_COLLECT_RADIUS_M) {
        showToast("Move closer to collect this item.");
        return;
      }

      const current = loadGameState();
      const next = applyMapItemCollect(current, item);
      if (!next) {
        showToast("Not enough energy");
        return;
      }
      const withProg = applyMapCollectProgression(next, item);
      saveGameState(withProg);
      setGame(withProg);
      mapDevLog("collected item", item.id, item.variant);
      setItems((prev) => {
        const filtered = prev.filter((i) => i.id !== item.id);
        persistItems(filtered);
        return filtered;
      });
      showToast(formatMapCollectToastWithXp(item));
    },
    [persistItems, showToast],
  );

  collectHandlerRef.current = collectItem;

  const onSearchNewArea = useCallback(() => {
    const pos = userPosRef.current;
    if (!pos) return;
    searchNewArea(pos, setItems);
    setManualCompassTargetId(null);
    showToast("Searching a new area…");
  }, [showToast]);

  const onSpawnNearbyTestItem = useCallback(() => {
    const pos = userPosRef.current;
    if (!pos) {
      showToast("Waiting for your position…");
      return;
    }
    const item = createNearbyTestMapItem(pos.lat, pos.lng);
    setItems((prev) => {
      const next = [...prev, item];
      persistItems(next);
      return next;
    });
    showToast("Spawned nearby test Coconut (10–20 m).");
  }, [persistItems, showToast]);

  const showDevSpawn =
    typeof process !== "undefined" && process.env.NODE_ENV === "development";

  const centerMapOnPlayer = useCallback(() => {
    const map = mapRef.current;
    const pos = userPosRef.current;
    if (!map || !pos) return;
    map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 16));
  }, []);

  const onFilterPlaceholder = useCallback(() => {
    showToast("Map filters coming soon.");
  }, [showToast]);

  useEffect(() => {
    if (!userPos || mapRef.current || !mapDivRef.current) return;

    let cancelled = false;

    void import("leaflet").then((L) => {
      const pos = userPosRef.current;
      if (cancelled || !mapDivRef.current || mapRef.current || !pos) return;

      const map = L.map(mapDivRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView([pos.lat, pos.lng], 17);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const circle = L.circleMarker([pos.lat, pos.lng], {
        radius: 12,
        color: "#06b6d4",
        fillColor: "#22d3ee",
        fillOpacity: 0.9,
        weight: 2,
      })
        .addTo(map)
        .bindPopup("You are here");

      playerMarkerRef.current = circle;
      mapRef.current = map;
      setMapReady(true);

      const rootEl = mapDivRef.current;
      if (rootEl) {
        const handleMapCollectClick = (e: MouseEvent) => {
          const btn = (e.target as HTMLElement).closest("[data-map-collect]");
          if (!btn || !rootEl.contains(btn)) return;
          e.preventDefault();
          e.stopPropagation();
          const id = btn.getAttribute("data-map-collect");
          if (!id) return;
          const found = itemsForMapRef.current.find((i) => i.id === id);
          if (found) collectHandlerRef.current(found);
        };
        rootEl.addEventListener("click", handleMapCollectClick);
        mapCollectCleanupRef.current = () => {
          rootEl.removeEventListener("click", handleMapCollectClick);
        };
      }

      window.setTimeout(() => {
        map.invalidateSize();
      }, 200);
    });

    return () => {
      cancelled = true;
    };
  }, [userPos]);

  useEffect(() => {
    if (!userPos || !playerMarkerRef.current) return;
    playerMarkerRef.current.setLatLng([userPos.lat, userPos.lng]);
  }, [userPos]);

  useEffect(() => {
    return () => {
      mapCollectCleanupRef.current?.();
      mapCollectCleanupRef.current = null;
      playerMarkerRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      itemMarkersRef.current.clear();
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    let cancelled = false;

    void import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      const map = mapRef.current;
      itemMarkersRef.current.forEach((m) => {
        m.remove();
      });
      itemMarkersRef.current.clear();

      const list = itemsForMapRef.current;
      const pos = userPosRef.current;

      list.forEach((item) => {
        const layout = mapItemIconLayout(item.rarity);
        const isSel = item.id === manualCompassTargetIdRef.current;
        const m = L.marker([item.lat, item.lng], {
          icon: L.icon({
            iconUrl: getMapItemIconSrc(item),
            ...layout,
            className: `map-item-marker-icon${isSel ? " map-item-marker--target" : ""}`,
          }),
        }).addTo(map);

        const distM =
          pos != null
            ? Math.round(haversineMeters(pos.lat, pos.lng, item.lat, item.lng))
            : null;

        m.bindPopup(buildItemPopupHtml(item, distM, isSel), {
          maxWidth: 260,
        });

        m.on("click", () => {
          setManualCompassTargetId(item.id);
        });

        itemMarkersRef.current.set(item.id, m);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [items, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    void import("leaflet").then((L) => {
      if (!mapRef.current) return;
      const pos = userPosRef.current;
      itemsForMapRef.current.forEach((item) => {
        const m = itemMarkersRef.current.get(item.id);
        if (!m || pos == null) return;
        const distM = Math.round(
          haversineMeters(pos.lat, pos.lng, item.lat, item.lng),
        );
        const isSel = item.id === manualCompassTargetId;
        m.setPopupContent(buildItemPopupHtml(item, distM, isSel));
        const layout = mapItemIconLayout(item.rarity);
        m.setIcon(
          L.icon({
            iconUrl: getMapItemIconSrc(item),
            ...layout,
            className: `map-item-marker-icon${isSel ? " map-item-marker--target" : ""}`,
          }),
        );
      });
    });
  }, [userPos, mapReady, items, manualCompassTargetId]);

  const xpPct = xpIntoCurrentLevel(game.xp);

  const allCollected =
    !mapItemsLoading && items.length === 0 && Boolean(userPos);

  const toastBottomClass = compassHudVisible
    ? "bottom-[max(17rem,env(safe-area-inset-bottom))]"
    : "bottom-[max(6.25rem,env(safe-area-inset-bottom))]";

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#1a120d]">
      <div
        ref={mapDivRef}
        className="treasure-map-leaflet absolute inset-0 z-0 h-full w-full [&_.leaflet-control-attribution]:z-[500] [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:bg-black/45 [&_.leaflet-control-attribution]:text-zinc-400 [&_.leaflet-marker-pane_img]:drop-shadow-[0_3px_12px_rgba(0,0,0,0.65)]"
      />

      {/* Top HUD — amber/fire strip (matches bottom dock) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[10000] px-2 pt-[env(safe-area-inset-top)] sm:px-3">
        <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-b-2xl border border-amber-400/25 border-t-0 bg-gradient-to-r from-amber-950/92 via-orange-900/82 to-black/85 px-3 py-3.5 shadow-[0_8px_28px_rgba(0,0,0,0.45),0_4px_18px_rgba(234,88,12,0.28),inset_0_-1px_0_rgba(251,191,36,0.12)] backdrop-blur-xl ring-1 ring-inset ring-amber-300/20">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-amber-400/45 bg-gradient-to-br from-amber-900/55 via-black to-orange-950/75 text-[14px] font-bold text-amber-50 shadow-[0_0_22px_rgba(251,191,36,0.35)] ring-1 ring-amber-400/35"
              aria-hidden
            >
              SG
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[14px] font-bold tracking-wide text-amber-50 drop-shadow-[0_1px_3px_rgba(0,0,0,0.75)]">
                Survivor
              </p>
              <p className="mt-0.5 text-[13px] tabular-nums text-amber-100/92">
                L<span className="font-bold text-amber-200">{game.level}</span>
                <span className="mx-2 text-amber-700/45">·</span>
                <span className="font-semibold text-[#fdf6e8]">
                  Energy {game.energy}
                </span>
              </p>
            </div>
            <div
              className="hidden h-9 max-w-[76px] flex-1 overflow-hidden rounded-full bg-black/55 ring-1 ring-amber-600/35 sm:block"
              title="XP progress"
              aria-hidden
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-600 to-amber-500 transition-[width] duration-300"
                style={{ width: `${xpPct}%` }}
              />
            </div>
          </div>
          <div
            className="flex shrink-0 items-center gap-3.5 text-[13px] font-semibold tabular-nums text-amber-50"
            title="Coins · Idols · Clues"
          >
            <span className="flex items-center gap-1.5">
              <Image
                src="/map-icons/coin.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 object-contain drop-shadow-[0_2px_10px_rgba(251,191,36,0.5)]"
              />
              {game.coins}
            </span>
            <span className="flex items-center gap-1.5">
              <Image
                src="/map-icons/medical-kit.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 object-contain drop-shadow-[0_2px_10px_rgba(251,191,36,0.45)]"
              />
              {game.idols}
            </span>
            <span className="flex items-center gap-1.5">
              <Image
                src="/map-icons/compass.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 object-contain drop-shadow-[0_2px_10px_rgba(251,191,36,0.45)]"
              />
              {game.clues}
            </span>
          </div>
        </div>

        {locationNote && (
          <p className="pointer-events-auto mx-3 mt-2 max-w-md rounded-lg border border-amber-500/35 bg-black/75 px-2.5 py-1.5 text-[11px] font-medium text-amber-50/95 backdrop-blur-md">
            {locationNote}
          </p>
        )}
      </div>

      {/* Right icon rail — below top HUD */}
      <div className="pointer-events-auto absolute right-2 top-[calc(env(safe-area-inset-top)+6.25rem)] z-[10000] flex flex-col gap-2 sm:right-3">
        <button
          type="button"
          className={hudIconBtn}
          aria-label="Filter map items"
          title="Filter (coming soon)"
          onClick={onFilterPlaceholder}
        >
          <IconFilter className="h-[19px] w-[19px]" aria-hidden />
        </button>
        <button
          type="button"
          className={hudIconBtn}
          aria-label="Center map on your location"
          title="Center on me"
          onClick={centerMapOnPlayer}
        >
          <IconLocate className="h-[19px] w-[19px]" aria-hidden />
        </button>
        <button
          type="button"
          className={hudIconBtn}
          aria-label="Search new area for items"
          title="Search new area"
          onClick={onSearchNewArea}
        >
          <IconRefreshArea className="h-[19px] w-[19px]" aria-hidden />
        </button>
        <button
          type="button"
          className={hudIconBtn}
          aria-label="How to play on the map"
          title="Map tips"
          onClick={() => setInfoOpen(true)}
        >
          <IconInfo className="h-[19px] w-[19px]" aria-hidden />
        </button>
      </div>

      {showDevSpawn && (
        <button
          type="button"
          onClick={onSpawnNearbyTestItem}
          className="pointer-events-auto absolute bottom-36 left-2 z-[10020] rounded-full border border-amber-700/50 bg-black/75 px-2 py-1 text-[10px] font-medium text-amber-200/90 backdrop-blur-md sm:bottom-40"
          title="Dev: spawn test item"
        >
          Dev spawn
        </button>
      )}

      {/* Compass — fixed above bottom dock; bearing always from userPos to target */}
      {compassHudVisible && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.05rem+env(safe-area-inset-bottom,0px))] z-[10040] flex flex-col items-center px-3">
          <div className="pointer-events-auto flex w-full max-w-lg flex-col items-center pb-1">
            <p className="mb-2.5 max-w-[min(92vw,380px)] rounded-2xl border border-amber-500/30 bg-black/92 px-5 py-2.5 text-center text-[13px] font-semibold leading-snug text-[#f5ecd8] shadow-[0_6px_28px_rgba(0,0,0,0.85),0_2px_12px_rgba(251,191,36,0.15)] backdrop-blur-xl ring-1 ring-amber-400/25">
              {compassLabel}
            </p>

            <div className="relative">
              <button
                type="button"
                onClick={() => setCompassHudVisible(false)}
                className="absolute -right-0.5 -top-0.5 z-[10045] flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-black text-[15px] font-light leading-none text-white shadow-[0_2px_10px_rgba(0,0,0,0.65)] transition hover:bg-zinc-900 active:scale-95"
                aria-label="Hide compass"
              >
                ×
              </button>

              <div className="island-map-compass-stack relative mx-auto size-[min(44vw,187px)] sm:size-[214px]">
                <Image
                  src="/map-ui/compass-base.png"
                  alt=""
                  fill
                  sizes="220px"
                  className="pointer-events-none object-contain object-center drop-shadow-[0_10px_28px_rgba(0,0,0,0.55)]"
                  priority
                />
                <Image
                  src="/map-ui/compass-dial.png"
                  alt=""
                  fill
                  sizes="220px"
                  className="pointer-events-none object-contain object-center drop-shadow-[0_10px_28px_rgba(0,0,0,0.55)] drop-shadow-[0_4px_14px_rgba(251,191,36,0.22)]"
                  style={{
                    transform: `rotate(${displayRotation}deg)`,
                    transformOrigin: "center center",
                    transition: NEEDLE_TRANSITION,
                  }}
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom dock — always above map + Leaflet attribution */}
      <Link
        href="/play"
        className="pointer-events-auto fixed bottom-0 left-0 right-0 z-[10060] flex justify-center rounded-t-2xl border border-b-0 border-amber-400/45 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-4 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2.5 text-center text-[13px] font-extrabold uppercase tracking-wide text-[#160c06] shadow-[0_-12px_40px_rgba(0,0,0,0.5),0_-6px_28px_rgba(234,88,12,0.48),inset_0_1px_0_rgba(255,255,255,0.22)] ring-1 ring-inset ring-amber-200/35 transition hover:brightness-[1.03] active:brightness-[0.98]"
      >
        <span className="max-w-lg drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]">
          Back to Dashboard
        </span>
      </Link>

      {!compassHudVisible && (
        <button
          type="button"
          onClick={() => setCompassHudVisible(true)}
          className="pointer-events-auto fixed bottom-[calc(4.65rem+env(safe-area-inset-bottom,0px))] right-3 z-[10055] flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-500/45 bg-black/80 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.28)] backdrop-blur-md transition hover:border-amber-300/60 hover:shadow-[0_0_22px_rgba(251,191,36,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 active:scale-95"
          aria-label="Show compass"
          title="Show compass"
        >
          <IconCompassRose className="h-[22px] w-[22px]" aria-hidden />
        </button>
      )}

      {/* Info modal */}
      {infoOpen && (
        <div
          className="fixed inset-0 z-[20000] flex items-end justify-center bg-black/55 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="map-info-title"
        >
          <div className="relative w-full max-w-sm rounded-2xl border border-teal-600/40 bg-[#0a1210]/96 p-5 shadow-[0_0_40px_rgba(20,184,166,0.2)] backdrop-blur-md">
            <button
              type="button"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-teal-700/50 bg-black/60 text-lg leading-none text-teal-200 transition hover:border-amber-500/45 hover:text-amber-50"
              onClick={() => setInfoOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <h2
              id="map-info-title"
              className="pr-10 text-sm font-semibold text-amber-100/95"
            >
              Island map
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-teal-100/85">
              Walk closer to items. Tap a marker to select it and open details;
              use Collect in the popup when you are within range.
            </p>
          </div>
        </div>
      )}

      {allCollected && (
        <div className="pointer-events-auto absolute bottom-[max(14.5rem,env(safe-area-inset-bottom))] left-1/2 z-[10030] w-[min(88vw,300px)] -translate-x-1/2 rounded-2xl border border-teal-600/40 bg-black/82 p-3 text-center shadow-lg backdrop-blur-md">
          <p className="text-xs font-medium text-[#f5f0e6]/95">
            All nearby items collected.
          </p>
          <button
            type="button"
            onClick={onSearchNewArea}
            className={`mt-2 w-full ${btnPrimarySm} py-2 text-xs`}
          >
            Search New Area
          </button>
        </div>
      )}

      {toast && (
        <div
          className={`pointer-events-none fixed left-1/2 z-[10070] max-w-[min(92vw,380px)] -translate-x-1/2 rounded-xl border border-teal-500/40 bg-[#0a1210]/95 px-4 py-2.5 text-center text-xs font-medium leading-snug text-[#f5f0e6] shadow-[0_0_28px_rgba(20,184,166,0.2)] ${toastBottomClass}`}
          role="status"
        >
          {toast}
        </div>
      )}

      {!userPos && (
        <div className="absolute inset-0 z-[9000] flex items-center justify-center bg-black/70 text-[#f5f0e6]/80">
          <p className="text-sm">Finding your position…</p>
        </div>
      )}
    </div>
  );
}
