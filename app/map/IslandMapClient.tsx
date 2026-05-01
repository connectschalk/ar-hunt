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
  return `<div style="font-size:13px;line-height:1.45;min-width:140px">
            <strong>${item.variant}</strong><br/>
            <span style="opacity:.85">${capRarity}</span><br/>
            <span style="opacity:.9">${distLine}</span>
            ${sel || ""}
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
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-teal-600/40 bg-black/65 text-teal-100 shadow-[0_0_14px_rgba(20,184,166,0.14)] backdrop-blur-md transition hover:border-amber-400/55 hover:text-amber-50 hover:shadow-[0_0_18px_rgba(251,191,36,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 active:scale-95";

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
  const playerMarkerRef = useRef<LeafletCircleMarker | null>(null);

  useEffect(() => {
    userPosRef.current = userPos;
  }, [userPos]);

  useEffect(() => {
    itemsForMapRef.current = items;
  }, [items]);

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

  /** North-up compass: bearing from user to target + optional PNG alignment. */
  const needleRotation = useMemo(() => {
    if (!userPos || !compassTargetItem) return 0;
    const bearing = calculateBearing(
      userPos.lat,
      userPos.lng,
      compassTargetItem.lat,
      compassTargetItem.lng,
    );
    return bearing + NEEDLE_ASSET_OFFSET;
  }, [userPos, compassTargetItem]);

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
        const isSel = item.id === manualCompassTargetId;
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

        m.on("click", (ev) => {
          L.DomEvent.stopPropagation(ev);
          setManualCompassTargetId(item.id);
          collectHandlerRef.current(item);
        });

        itemMarkersRef.current.set(item.id, m);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [items, mapReady, manualCompassTargetId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    void import("leaflet").then(() => {
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
      });
    });
  }, [userPos, mapReady, items, manualCompassTargetId]);

  const xpPct = xpIntoCurrentLevel(game.xp);

  const allCollected =
    !mapItemsLoading && items.length === 0 && Boolean(userPos);

  const toastBottomClass = compassHudVisible
    ? "bottom-[max(15.5rem,env(safe-area-inset-bottom))]"
    : "bottom-[max(5.5rem,env(safe-area-inset-bottom))]";

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#1a120d]">
      <div
        ref={mapDivRef}
        className="treasure-map-leaflet absolute inset-0 z-0 h-full w-full [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:bg-black/45 [&_.leaflet-control-attribution]:text-zinc-400 [&_.leaflet-marker-pane_img]:drop-shadow-[0_3px_12px_rgba(0,0,0,0.65)]"
      />

      {/* Top HUD — edge-attached bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] pt-[env(safe-area-inset-top)]">
        <div className="pointer-events-auto flex items-center justify-between gap-2 border-b border-teal-500/25 bg-black/55 px-3 py-2 shadow-[0_4px_24px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-500/35 bg-gradient-to-br from-teal-900/65 to-black text-[11px] font-bold text-amber-200/95 ring-1 ring-black/40"
              aria-hidden
            >
              SG
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[11px] font-semibold tracking-wide text-teal-100/95">
                Survivor
              </p>
              <p className="text-[10px] tabular-nums text-teal-200/80">
                L<span className="text-amber-200/95">{game.level}</span>
                <span className="mx-1.5 text-teal-700/45">·</span>
                Energy{" "}
                <span className="font-medium text-[#f5f0e6]/95">
                  {game.energy}
                </span>
              </p>
            </div>
            <div
              className="hidden h-7 max-w-[64px] flex-1 overflow-hidden rounded-full bg-black/45 ring-1 ring-teal-800/35 sm:block"
              title="XP progress"
              aria-hidden
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-600 to-amber-500/80 transition-[width] duration-300"
                style={{ width: `${xpPct}%` }}
              />
            </div>
          </div>
          <div
            className="flex shrink-0 items-center gap-2.5 text-[10px] tabular-nums text-[#f5f0e6]/95"
            title="Coins · Idols · Clues"
          >
            <span className="flex items-center gap-1">
              <Image
                src="/map-icons/coin.png"
                alt=""
                width={18}
                height={18}
                className="h-[18px] w-[18px] object-contain opacity-95"
              />
              {game.coins}
            </span>
            <span className="flex items-center gap-1">
              <Image
                src="/map-icons/medical-kit.png"
                alt=""
                width={18}
                height={18}
                className="h-[18px] w-[18px] object-contain opacity-95"
              />
              {game.idols}
            </span>
            <span className="flex items-center gap-1">
              <Image
                src="/map-icons/compass.png"
                alt=""
                width={18}
                height={18}
                className="h-[18px] w-[18px] object-contain opacity-95"
              />
              {game.clues}
            </span>
          </div>
        </div>

        {locationNote && (
          <p className="pointer-events-auto mx-3 mt-2 max-w-md rounded-lg border border-amber-600/30 bg-black/65 px-2.5 py-1.5 text-[11px] text-amber-100/90 backdrop-blur-md">
            {locationNote}
          </p>
        )}
      </div>

      {/* Right icon rail — below top HUD */}
      <div className="pointer-events-auto absolute right-2 top-[calc(env(safe-area-inset-top)+4.75rem)] z-[1000] flex flex-col gap-1.5 sm:right-3">
        <button
          type="button"
          className={hudIconBtn}
          aria-label="Filter map items"
          title="Filter (coming soon)"
          onClick={onFilterPlaceholder}
        >
          <IconFilter className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <button
          type="button"
          className={hudIconBtn}
          aria-label="Center map on your location"
          title="Center on me"
          onClick={centerMapOnPlayer}
        >
          <IconLocate className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <button
          type="button"
          className={hudIconBtn}
          aria-label="Search new area for items"
          title="Search new area"
          onClick={onSearchNewArea}
        >
          <IconRefreshArea className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <button
          type="button"
          className={hudIconBtn}
          aria-label="How to play on the map"
          title="Map tips"
          onClick={() => setInfoOpen(true)}
        >
          <IconInfo className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>

      {showDevSpawn && (
        <button
          type="button"
          onClick={onSpawnNearbyTestItem}
          className="pointer-events-auto absolute bottom-36 left-2 z-[999] rounded-full border border-amber-700/50 bg-black/75 px-2 py-1 text-[10px] font-medium text-amber-200/90 backdrop-blur-md sm:bottom-40"
          title="Dev: spawn test item"
        >
          Dev spawn
        </button>
      )}

      {/* Compass cluster — label, dial stack, amber dock below */}
      {compassHudVisible && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex flex-col items-center">
          <div className="pointer-events-auto flex w-full max-w-lg flex-col items-center px-3 pb-2">
            <p className="mb-2 max-w-[min(92vw,340px)] rounded-full border border-amber-500/25 bg-black/75 px-4 py-1.5 text-center text-[11px] font-medium leading-snug text-[#f8efd9] shadow-[0_2px_16px_rgba(0,0,0,0.65)] backdrop-blur-md ring-1 ring-black/50">
              {compassLabel}
            </p>

            <div className="relative">
              <button
                type="button"
                onClick={() => setCompassHudVisible(false)}
                className="absolute -right-0.5 -top-0.5 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black text-[15px] font-light leading-none text-white shadow-[0_2px_10px_rgba(0,0,0,0.65)] transition hover:bg-zinc-900 active:scale-95"
                aria-label="Hide compass"
              >
                ×
              </button>

              <div className="relative mx-auto size-[min(42vw,165px)] shadow-[0_8px_36px_rgba(251,191,36,0.2),0_6px_28px_rgba(234,88,12,0.18),0_4px_20px_rgba(0,0,0,0.55)] sm:size-[190px]">
                <Image
                  src="/map-ui/compass-base.png"
                  alt=""
                  fill
                  sizes="190px"
                  className="pointer-events-none object-contain object-center"
                  priority
                />
                <Image
                  src="/map-ui/compass-dial.png"
                  alt=""
                  fill
                  sizes="190px"
                  className="pointer-events-none object-contain object-center"
                  style={{
                    transform: `rotate(${needleRotation}deg)`,
                    transformOrigin: "center center",
                  }}
                  priority
                />
              </div>
            </div>
          </div>

          <Link
            href="/play"
            className="pointer-events-auto mt-1 flex w-full max-w-lg justify-center rounded-t-[1.15rem] border border-amber-500/35 border-b-0 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-4 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2.5 text-center text-[12px] font-semibold uppercase tracking-wide text-[#1a0f08] shadow-[0_-6px_28px_rgba(234,88,12,0.35)] ring-1 ring-amber-400/30 transition hover:brightness-105 active:scale-[0.99]"
          >
            Back to Dashboard
          </Link>
        </div>
      )}

      {!compassHudVisible && (
        <button
          type="button"
          onClick={() => setCompassHudVisible(true)}
          className="pointer-events-auto fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-[1001] flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-teal-600/40 bg-black/65 text-teal-100 shadow-[0_0_14px_rgba(20,184,166,0.14)] backdrop-blur-md transition hover:border-amber-400/55 hover:text-amber-50 hover:shadow-[0_0_18px_rgba(251,191,36,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 active:scale-95"
          aria-label="Show compass"
          title="Show compass"
        >
          <IconCompassRose className="h-[22px] w-[22px]" aria-hidden />
        </button>
      )}

      {/* Info modal */}
      {infoOpen && (
        <div
          className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/55 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center"
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
              Walk closer to items. Tap markers when nearby to collect resources.
              Tap an item to make the compass point to it.
            </p>
          </div>
        </div>
      )}

      {allCollected && (
        <div className="pointer-events-auto absolute bottom-[max(13.5rem,env(safe-area-inset-bottom))] left-1/2 z-[999] w-[min(88vw,300px)] -translate-x-1/2 rounded-2xl border border-teal-600/40 bg-black/82 p-3 text-center shadow-lg backdrop-blur-md">
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
          className={`pointer-events-none fixed left-1/2 z-[1002] max-w-[min(92vw,380px)] -translate-x-1/2 rounded-xl border border-teal-500/40 bg-[#0a1210]/95 px-4 py-2.5 text-center text-xs font-medium leading-snug text-[#f5f0e6] shadow-[0_0_28px_rgba(20,184,166,0.2)] ${toastBottomClass}`}
          role="status"
        >
          {toast}
        </div>
      )}

      {!userPos && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/70 text-[#f5f0e6]/80">
          <p className="text-sm">Finding your position…</p>
        </div>
      )}
    </div>
  );
}
