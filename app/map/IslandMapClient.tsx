"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
import {
  applyMapItemCollect,
  clearPersistedMapState,
  generateMapItems,
  loadPersistedMapState,
  MAP_FALLBACK_LAT,
  MAP_FALLBACK_LNG,
  MAP_ITEMS_TTL_MS,
  MAP_MARKER_STYLES,
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

export function IslandMapClient() {
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [game, setGame] = useState<GameState>(DEFAULT_GAME_STATE);
  const [items, setItems] = useState<MapItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const itemMarkersRef = useRef<Map<string, CircleMarker>>(new Map());
  const itemsForMapRef = useRef<MapItem[]>([]);
  const userPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const collectHandlerRef = useRef<(item: MapItem) => void>(() => {});

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
    navigator.geolocation.getCurrentPosition(
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
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 },
    );
  }, []);

  useEffect(() => {
    if (!userPos) return;
    const persisted = loadPersistedMapState();
    const stillFresh =
      persisted &&
      Date.now() - persisted.savedAt < MAP_ITEMS_TTL_MS &&
      persisted.items.length > 0;

    if (stillFresh) {
      setItems(persisted.items);
    } else {
      const generated = generateMapItems(
        userPos.lat,
        userPos.lng,
        randomSpawnCount(),
      );
      setItems(generated);
      savePersistedMapState({
        savedAt: Date.now(),
        centerLat: userPos.lat,
        centerLng: userPos.lng,
        items: generated,
      });
    }
  }, [userPos]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const collectItem = useCallback(
    (item: MapItem) => {
      const current = loadGameState();
      const next = applyMapItemCollect(current, item);
      if (!next) {
        showToast("Not enough energy");
        return;
      }
      saveGameState(next);
      setGame(next);
      const pos = userPosRef.current;
      setItems((prev) => {
        const filtered = prev.filter((i) => i.id !== item.id);
        if (pos) {
          savePersistedMapState({
            savedAt: Date.now(),
            centerLat: pos.lat,
            centerLng: pos.lng,
            items: filtered,
          });
        }
        return filtered;
      });
      showToast(`You found: ${item.variant}`);
    },
    [showToast],
  );

  collectHandlerRef.current = collectItem;

  const refreshSpawns = useCallback(() => {
    const pos = userPosRef.current;
    if (!pos) return;
    clearPersistedMapState();
    const generated = generateMapItems(pos.lat, pos.lng, randomSpawnCount());
    setItems(generated);
    savePersistedMapState({
      savedAt: Date.now(),
      centerLat: pos.lat,
      centerLng: pos.lng,
      items: generated,
    });
    showToast("New supplies scattered nearby.");
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
      list.forEach((item) => {
        const colors = MAP_MARKER_STYLES[item.type];
        const m = L.circleMarker([item.lat, item.lng], {
          radius: 10,
          color: colors.stroke,
          fillColor: colors.fill,
          fillOpacity: 0.92,
          weight: 2,
        }).addTo(map);

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
  }, [items, mapReady]);

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
              −2 per pickup on the map
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
              onClick={refreshSpawns}
              className="pointer-events-auto rounded-xl border border-zinc-600 bg-zinc-900/90 px-3 py-2 text-xs font-medium text-zinc-200 backdrop-blur-md hover:bg-zinc-800"
            >
              Refresh spawns
            </button>
          </div>
        </div>

        {locationNote && (
          <p className="pointer-events-auto max-w-md rounded-xl border border-amber-900/40 bg-black/70 px-3 py-2 text-xs text-amber-200/90 backdrop-blur-md">
            {locationNote}
          </p>
        )}
      </div>

      {toast && (
        <div
          className="pointer-events-none fixed bottom-24 left-1/2 z-[1001] max-w-[90vw] -translate-x-1/2 rounded-2xl border border-emerald-600/50 bg-emerald-950/95 px-5 py-3 text-center text-sm font-medium text-emerald-50 shadow-xl"
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
