"use client";

/**
 * The sex the user chose on the home page. It picks which 3D body is shown and
 * is sent to search, which then hides conditions specific to the other sex.
 * Kept in this browser only.
 */
import { useSyncExternalStore } from "react";
import type { BodyId } from "@/components/body/segmentBody";

export type BodySex = "female" | "male" | "unspecified";

const KEY = "medseek.bodySex";
const listeners = new Set<() => void>();

function read(): BodySex | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "female" || v === "male" || v === "unspecified" ? v : null;
  } catch {
    return null;
  }
}

export function setBodySex(value: BodySex) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* private mode: the choice lasts until the page closes */
    memory = value;
  }
  listeners.forEach((l) => l());
}

let memory: BodySex | null = null;

function snapshot(): BodySex | null {
  return read() ?? memory;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** null until the user has answered (and always null during server rendering). */
export function useBodySex(): BodySex | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** Current choice outside React (for building a search request). */
export function getBodySex(): BodySex | null {
  return typeof window === "undefined" ? null : snapshot();
}

/** Which body to draw for a choice. "Prefer not to say" shows the male body. */
export function bodyFor(sex: BodySex | null): BodyId {
  return sex === "female" ? "female" : "male";
}

/** The value for the search API's `sex` parameter, or null for no filter. */
export function searchSexFor(sex: BodySex | null): "female" | "male" | null {
  return sex === "female" || sex === "male" ? sex : null;
}
