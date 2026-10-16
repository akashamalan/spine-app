"use client";

import { useSyncExternalStore } from "react";

/** Small per-browser preferences (Settings, right-click menus). Stored in
 * localStorage; if storage is blocked they last for the visit. */

export type Wallpaper = "calm" | "normal" | "lively";
export type MotionPref = "system" | "reduce";

export type Prefs = {
  wallpaper: Wallpaper;
  motion: MotionPref;
  /** Remember window positions between visits. */
  rememberLayout: boolean;
  /** Findings this person hid for themselves. Never deletes anything. */
  hiddenFindings: string[];
  /** Admins: show only the Vera questions aimed at me. */
  veraOnlyMine: boolean;
  noticedOnlyUrgent: boolean;
};

const KEY = "spine-prefs-v1";
const DEFAULTS: Prefs = {
  wallpaper: "normal",
  motion: "system",
  rememberLayout: true,
  hiddenFindings: [],
  veraOnlyMine: false,
  noticedOnlyUrgent: false,
};

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: Prefs = DEFAULTS;

function read(): Prefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cached;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const v = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    cached = {
      wallpaper: v.wallpaper === "calm" || v.wallpaper === "lively" ? v.wallpaper : "normal",
      motion: v.motion === "reduce" ? "reduce" : "system",
      rememberLayout: v.rememberLayout !== false,
      hiddenFindings: Array.isArray(v.hiddenFindings) ? v.hiddenFindings.filter((x) => typeof x === "string") : [],
      veraOnlyMine: !!v.veraOnlyMine,
      noticedOnlyUrgent: !!v.noticedOnlyUrgent,
    };
  } catch {
    cached = DEFAULTS;
  }
  return cached;
}

export function getPrefs(): Prefs {
  return read();
}

export function setPrefs(patch: Partial<Prefs>) {
  const next = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: keep it for this visit only.
    cached = next;
  }
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    read,
    () => DEFAULTS
  );
}
