// The user's area for the local signal: a grid cell of 0.5 degrees (~55 km).
//
// Location is asked for only when the user presses "Use my area". The
// coordinates are rounded down to the cell here, in the browser, and only the
// cell's corner (e.g. "19.0,72.5") is ever stored or sent to the server.

import { useCallback, useSyncExternalStore } from "react";

const KEY = "medseek.areaCell";
const CELL = 0.5;
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(value: string | null) {
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode / blocked storage: the area simply is not remembered.
  }
  listeners.forEach((l) => l());
}

export function toCell(lat: number, lon: number): string {
  const snap = (v: number) => (Math.floor(v / CELL) * CELL).toFixed(1);
  return `${snap(lat)},${snap(lon)}`;
}

/** The saved area cell, or null. Safe to call outside React. */
export function getAreaCell(): string | null {
  return typeof window === "undefined" ? null : read();
}

export type AreaStatus = "idle" | "locating" | "denied" | "unavailable";

export function useAreaCell() {
  const cell = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => null
  );

  const request = useCallback(
    (onStatus: (s: AreaStatus) => void) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        onStatus("unavailable");
        return;
      }
      onStatus("locating");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          write(toCell(pos.coords.latitude, pos.coords.longitude));
          onStatus("idle");
        },
        (err) => onStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60 * 60 * 1000 }
      );
    },
    []
  );

  const clear = useCallback(() => write(null), []);
  return { cell, request, clear };
}
