"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  calculateBearing,
  getClosestItem,
} from "@/lib/map-geo";
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
import { btnPrimarySm, btnSecondarySm } from "@/lib/survivor-ui";
import { useDeviceHeading } from "@/app/map/useDeviceHeading";

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

  const {
    headingDeg,
    permission,
    requestCompassPermission,
    headingAvailable,
  } = useDeviceHeading();

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
  }, [
    compassTargetItem,
    userPos,
    manualCompassTargetId,
    items,
  ]);

  const bearingDeg = useMemo(() => {
    if (!userPos || !compassTargetItem) return 0;
    return calculateBearing(
      userPos.lat,
      userPos.lng,
      compassTargetItem.lat,
      compassTargetItem.lng,
    );
  }, [userPos, compassTargetItem]);

  const baseRotation = headingDeg != null ? -headingDeg : 0;

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
        zoomControl: true,
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

        m.bindPopup(
          buildItemPopupHtml(item, distM, isSel),
          { maxWidth: 260 },
        );

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

  const toastBottomClass = compassHudVisible ? "bottom-52" : "bottom-24";

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#1a120d]">
      <div
        ref={mapDivRef}
        className="treasure-map-leaflet absolute inset-0 z-0 h-full w-full [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:bg-black/50 [&_.leaflet-control-attribution]:text-zinc-400 [&_.leaflet-marker-pane_img]:drop-shadow-[0_3px_14px_rgba(0,0,0,0.75)] [&_.map-item-marker-icon]:drop-shadow-[0_3px_14px_rgba(0,0,0,0.72)] [&_.map-item-marker-icon]:contrast-[1.08]"
      />

      {/* Top HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-col gap-2 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* Player HUD */}
          <div className="pointer-events-auto flex max-w-[min(100%,280px)] items-center gap-3 rounded-2xl border border-teal-500/40 bg-black/82 px-3 py-2.5 shadow-[0_0_28px_rgba(20,184,166,0.14)] backdrop-blur-md">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-amber-500/45 bg-gradient-to-br from-teal-900/80 to-black text-lg font-bold text-amber-200/95 shadow-inner"
              aria-hidden
            >
              SG
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold uppercase tracking-wide text-teal-300/90">
                Survivor
              </p>
              <p className="mt-0.5 text-[11px] text-teal-200/55">
                Level{" "}
                <span className="font-semibold text-amber-200/95">
                  {game.level}
                </span>
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-teal-400/80">
                  Energy
                </span>
                <span className="text-sm font-bold tabular-nums text-[#f5f0e6]">
                  {game.energy}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/60 ring-1 ring-teal-700/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-600 to-amber-500/90 transition-[width] duration-300"
                  style={{ width: `${xpPct}%` }}
                />
              </div>
              <p className="mt-1 text-[9px] text-teal-200/45">
                XP bar · −2 energy per pickup · collect within {MAP_COLLECT_RADIUS_M}
                m
              </p>
            </div>
          </div>

          {/* Resources + actions */}
          <div className="pointer-events-auto flex max-w-[min(100%,240px)] flex-col items-end gap-2">
            <div className="rounded-2xl border border-amber-500/35 bg-black/82 px-3 py-2 text-right shadow-[0_0_24px_rgba(251,191,36,0.1)] backdrop-blur-md">
              <p className="text-[10px] font-medium uppercase tracking-wider text-amber-300/85">
                Supplies
              </p>
              <p className="mt-1 text-sm tabular-nums text-[#f5f0e6]">
                <span className="text-teal-300/90">Coins</span>{" "}
                <span className="font-semibold">{game.coins}</span>
              </p>
              <p className="mt-0.5 text-xs tabular-nums text-teal-200/70">
                Idols {game.idols} · Clues {game.clues}
              </p>
            </div>
            <Link
              href="/play"
              className={`${btnPrimarySm} inline-flex w-full min-w-[11rem] items-center justify-center`}
            >
              Back to Dashboard
            </Link>
            <button
              type="button"
              onClick={onSearchNewArea}
              className={`${btnSecondarySm} w-full min-w-[11rem]`}
            >
              Search New Area
            </button>
            {showDevSpawn && (
              <button
                type="button"
                onClick={onSpawnNearbyTestItem}
                className={`${btnSecondarySm} w-full min-w-[11rem] border border-amber-600/45 text-amber-100/95`}
              >
                Spawn nearby test item
              </button>
            )}
          </div>
        </div>

        <div className="pointer-events-auto max-w-md rounded-2xl border border-teal-600/35 bg-black/78 px-3 py-2.5 text-xs leading-snug text-[#f5f0e6]/90 shadow-[0_0_24px_rgba(251,191,36,0.08)] backdrop-blur-md">
          Walk closer to items. Tap markers when nearby to collect — selected
          markers glow as your compass target.
        </div>

        {locationNote && (
          <p className="pointer-events-auto max-w-md rounded-xl border border-amber-600/40 bg-black/75 px-3 py-2 text-xs text-amber-100/90 backdrop-blur-md">
            {locationNote}
          </p>
        )}
      </div>

      {/* Right-side controls */}
      <div className="pointer-events-auto absolute right-3 top-[42%] z-[1000] flex -translate-y-1/2 flex-col gap-2 sm:right-4">
        <button
          type="button"
          onClick={centerMapOnPlayer}
          className="rounded-2xl border border-teal-600/50 bg-black/78 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-teal-100 shadow-[0_0_18px_rgba(20,184,166,0.18)] backdrop-blur-md transition hover:border-amber-500/45 hover:text-amber-100"
        >
          Center
        </button>
        <button
          type="button"
          onClick={onFilterPlaceholder}
          className="rounded-2xl border border-teal-700/45 bg-black/78 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-teal-200/85 backdrop-blur-md transition hover:border-amber-500/35"
        >
          Filter
        </button>
      </div>

      {/* Compass HUD */}
      {compassHudVisible && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-[1000] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mx-auto max-w-lg rounded-3xl border border-teal-500/40 bg-black/85 px-4 py-3 shadow-[0_0_36px_rgba(20,184,166,0.18)] backdrop-blur-lg">
            <p className="mb-2 text-center text-[11px] font-medium leading-snug text-amber-100/95">
              {compassLabel}
            </p>
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <button
                type="button"
                onClick={() => setCompassHudVisible(false)}
                className="shrink-0 rounded-2xl border border-teal-700/50 bg-black/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-teal-100 transition hover:border-amber-500/45 hover:text-amber-50"
              >
                Hide
              </button>

              <div className="relative mx-auto h-[min(28vw,7.5rem)] w-[min(28vw,7.5rem)] shrink-0 sm:h-32 sm:w-32">
                <div
                  className="absolute inset-0 transition-transform duration-150 ease-out will-change-transform"
                  style={{
                    transform: `rotate(${baseRotation}deg)`,
                  }}
                >
                  <Image
                    src="/map-ui/compass-base.png"
                    alt=""
                    width={256}
                    height={256}
                    className="pointer-events-none h-full w-full object-contain drop-shadow-[0_4px_18px_rgba(0,0,0,0.65)]"
                    priority
                  />
                  <Image
                    src="/map-ui/compass-dial.png"
                    alt=""
                    width={256}
                    height={256}
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain drop-shadow-[0_2px_12px_rgba(251,191,36,0.35)]"
                    style={{
                      transform: `rotate(${bearingDeg}deg)`,
                      transformOrigin: "center center",
                    }}
                    priority
                  />
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={() => void requestCompassPermission()}
                  className="rounded-2xl border border-amber-500/45 bg-black/55 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-amber-100/95 transition hover:bg-black/70"
                >
                  Compass
                </button>
                {permission === "unknown" && (
                  <button
                    type="button"
                    onClick={() => void requestCompassPermission()}
                    className="rounded-xl border border-teal-600/50 px-2 py-1.5 text-[10px] font-medium text-teal-100/90"
                  >
                    Enable compass
                  </button>
                )}
                {permission === "denied" && (
                  <span className="max-w-[5.5rem] text-[9px] leading-tight text-teal-200/55">
                    Heading unavailable — needle uses map north.
                  </span>
                )}
                {!headingAvailable && permission === "granted" && (
                  <span className="max-w-[5.5rem] text-[9px] text-teal-200/50">
                    Point device to refresh heading.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!compassHudVisible && (
        <button
          type="button"
          onClick={() => setCompassHudVisible(true)}
          className="pointer-events-auto fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[1001] rounded-full border border-amber-500/50 bg-black/85 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.25)] backdrop-blur-md transition hover:border-teal-400/55"
        >
          Compass
        </button>
      )}

      {allCollected && (
        <div className="pointer-events-auto absolute bottom-48 left-1/2 z-[1000] w-[min(92vw,360px)] -translate-x-1/2 rounded-2xl border border-teal-600/40 bg-black/88 p-4 text-center shadow-[0_0_32px_rgba(234,88,12,0.15)] backdrop-blur-md sm:bottom-56">
          <p className="text-sm font-medium text-[#f5f0e6]">
            All nearby items collected.
          </p>
          <button
            type="button"
            onClick={onSearchNewArea}
            className={`mt-3 w-full ${btnPrimarySm}`}
          >
            Search New Area
          </button>
        </div>
      )}

      {toast && (
        <div
          className={`pointer-events-none fixed left-1/2 z-[1002] max-w-[min(92vw,380px)] -translate-x-1/2 rounded-2xl border border-teal-500/40 bg-[#0a1210]/95 px-5 py-3 text-center text-sm font-medium leading-snug text-[#f5f0e6] shadow-[0_0_28px_rgba(20,184,166,0.2)] ${toastBottomClass}`}
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
