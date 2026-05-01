"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
import {
  applyMapItemCollect,
  clearPersistedMapState,
  formatCollectToast,
  generateMapItems,
  haversineMeters,
  loadPersistedMapState,
  MAP_COLLECT_RADIUS_M,
  MAP_FALLBACK_LAT,
  MAP_FALLBACK_LNG,
  MAP_ITEMS_TTL_MS,
  MAP_MARKER_STYLES,
  markerRadiusForRarity,
  savePersistedMapState,
  type MapItem,
} from "@/lib/map-items";
import {
  DEFAULT_GAME_STATE,
  loadGameState,
  saveGameState,
  type GameState,
} from "@/lib/survivor-mvp";

function randomSpawnCount(): number {
  return 5 + Math.floor(Math.random() * 6);
}

function searchNewArea(
  pos: { lat: number; lng: number },
  setItems: (items: MapItem[]) => void,
) {
  clearPersistedMapState();
  const generated = generateMapItems(pos.lat, pos.lng, randomSpawnCount());
  setItems(generated);
  savePersistedMapState({
    savedAt: Date.now(),
    centerLat: pos.lat,
    centerLng: pos.lng,
    items: generated,
  });
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

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const itemMarkersRef = useRef<Map<string, CircleMarker>>(new Map());
  const itemsForMapRef = useRef<MapItem[]>([]);
  const userPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const collectHandlerRef = useRef<(item: MapItem) => void>(() => {});
  const itemsSeededRef = useRef(false);

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
    if (!userPos || itemsSeededRef.current) return;
    itemsSeededRef.current = true;
    const persisted = loadPersistedMapState();
    const stillFresh =
      persisted &&
      Date.now() - persisted.savedAt < MAP_ITEMS_TTL_MS &&
      persisted.items.length > 0;

    if (stillFresh) {
      setItems(persisted.items);
    } else {
      searchNewArea(userPos, setItems);
    }
    setMapItemsLoading(false);
  }, [userPos]);

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
      saveGameState(next);
      setGame(next);
      setItems((prev) => {
        const filtered = prev.filter((i) => i.id !== item.id);
        persistItems(filtered);
        return filtered;
      });
      showToast(formatCollectToast(item));
    },
    [persistItems, showToast],
  );

  collectHandlerRef.current = collectItem;

  const onSearchNewArea = useCallback(() => {
    const pos = userPosRef.current;
    if (!pos) return;
    searchNewArea(pos, setItems);
    showToast("Searching a new area…");
  }, [showToast]);

  useEffect(() => {
    if (!userPos || !mapDivRef.current || mapRef.current) return;

    let cancelled = false;

    void import("leaflet").then((L) => {
      if (cancelled || !mapDivRef.current || mapRef.current) return;

      const map = L.map(mapDivRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([userPos.lat, userPos.lng], 17);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      L.circleMarker([userPos.lat, userPos.lng], {
        radius: 12,
        color: "#06b6d4",
        fillColor: "#22d3ee",
        fillOpacity: 0.9,
        weight: 2,
      })
        .addTo(map)
        .bindPopup("You are here");

      mapRef.current = map;
      setMapReady(true);

      window.setTimeout(() => {
        map.invalidateSize();
      }, 200);
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      itemMarkersRef.current.clear();
      setMapReady(false);
    };
  }, [userPos]);

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
        const colors = MAP_MARKER_STYLES[item.type];
        const radius = markerRadiusForRarity(item.rarity);
        const m = L.circleMarker([item.lat, item.lng], {
          radius,
          color: colors.stroke,
          fillColor: colors.fill,
          fillOpacity: 0.92,
          weight: 2,
        }).addTo(map);

        const distM =
          pos != null
            ? Math.round(haversineMeters(pos.lat, pos.lng, item.lat, item.lng))
            : null;
        const distLine =
          distM != null ? `${distM} m away` : "Distance: —";
        const capRarity =
          item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1);
        m.bindPopup(
          `<div style="font-size:13px;line-height:1.45;min-width:140px">
            <strong>${item.variant}</strong><br/>
            <span style="opacity:.85">${capRarity}</span><br/>
            <span style="opacity:.9">${distLine}</span>
          </div>`,
          { maxWidth: 260 },
        );

        m.on("click", (ev) => {
          L.DomEvent.stopPropagation(ev);
          collectHandlerRef.current(item);
        });

        itemMarkersRef.current.set(item.id, m);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [items, mapReady, userPos]);

  const allCollected =
    !mapItemsLoading && items.length === 0 && Boolean(userPos);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0a1628]">
      <div
        ref={mapDivRef}
        className="absolute inset-0 z-0 h-full w-full [&_.leaflet-control-attribution]:text-[10px] [&_.leaflet-control-attribution]:bg-black/50 [&_.leaflet-control-attribution]:text-zinc-400"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex flex-col gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto flex flex-wrap items-start justify-between gap-2">
          <div className="rounded-2xl border border-emerald-800/60 bg-black/75 px-4 py-3 shadow-lg backdrop-blur-md">
            <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-500/90">
              Energy
            </p>
            <p className="text-2xl font-bold tabular-nums text-white">
              {game.energy}
            </p>
            <p className="mt-1 text-[10px] text-zinc-500">
              −2 per pickup · collect within {MAP_COLLECT_RADIUS_M}m
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Link
              href="/play"
              className="pointer-events-auto rounded-2xl border border-amber-800/50 bg-amber-950/90 px-4 py-2.5 text-sm font-semibold text-amber-100 shadow-lg backdrop-blur-md transition hover:bg-amber-900/90"
            >
              Back to Dashboard
            </Link>
            <button
              type="button"
              onClick={onSearchNewArea}
              className="pointer-events-auto rounded-xl border border-zinc-600 bg-zinc-900/90 px-3 py-2 text-xs font-medium text-zinc-200 backdrop-blur-md hover:bg-zinc-800"
            >
              Search New Area
            </button>
          </div>
        </div>

        <div className="pointer-events-auto max-w-md rounded-2xl border border-emerald-800/40 bg-black/70 px-3 py-2.5 text-xs leading-snug text-emerald-100/90 shadow-lg backdrop-blur-md">
          Walk closer to items. Tap them when nearby to collect resources for your
          tribe.
        </div>

        {locationNote && (
          <p className="pointer-events-auto max-w-md rounded-xl border border-amber-900/40 bg-black/70 px-3 py-2 text-xs text-amber-200/90 backdrop-blur-md">
            {locationNote}
          </p>
        )}
      </div>

      {allCollected && (
        <div className="pointer-events-auto absolute bottom-28 left-1/2 z-[1000] w-[min(92vw,360px)] -translate-x-1/2 rounded-2xl border border-amber-800/50 bg-black/85 p-4 text-center shadow-xl backdrop-blur-md">
          <p className="text-sm font-medium text-amber-100">
            All nearby items collected.
          </p>
          <button
            type="button"
            onClick={onSearchNewArea}
            className="mt-3 w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-sm font-bold text-emerald-950"
          >
            Search New Area
          </button>
        </div>
      )}

      {toast && (
        <div
          className="pointer-events-none fixed bottom-24 left-1/2 z-[1001] max-w-[min(92vw,380px)] -translate-x-1/2 rounded-2xl border border-emerald-600/50 bg-emerald-950/95 px-5 py-3 text-center text-sm font-medium leading-snug text-emerald-50 shadow-xl"
          role="status"
        >
          {toast}
        </div>
      )}

      {!userPos && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/60 text-zinc-300">
          <p className="text-sm">Finding your position…</p>
        </div>
      )}
    </div>
  );
}
