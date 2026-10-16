"use client";

import { useSyncExternalStore } from "react";

/** Demo identity — not real authentication. The browser remembers who it is
 * pretending to be and says so on every request; the server believes it. See
 * backend/auth.py. */

export type Role = "admin" | "viewer";
export type Identity = { personId: string; name: string; role: Role };

const KEY = "spine-identity";
const listeners = new Set<() => void>();

// Parsing creates a new object each time, so the parsed value is cached and
// only replaced when the stored text actually changes.
let cachedRaw: string | null | undefined;
let cached: Identity | null = null;

function read(): Identity | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Storage blocked: fall through to the in-memory value below.
    return cached;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const v = raw ? (JSON.parse(raw) as Partial<Identity>) : null;
    cached =
      v && typeof v.personId === "string" && typeof v.name === "string" && (v.role === "admin" || v.role === "viewer")
        ? { personId: v.personId, name: v.name, role: v.role }
        : null;
  } catch {
    cached = null;
  }
  return cached;
}

function emit() {
  listeners.forEach((l) => l());
}

export function setIdentity(next: Identity | null) {
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: keep it for this visit only.
    cached = next;
  }
  emit();
}

export function getIdentity(): Identity | null {
  return read();
}

export function useIdentity(): Identity | null {
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
    () => null
  );
}

/** The headers the server reads to decide who is asking. */
export function identityHeaders(): Record<string, string> {
  const id = read();
  if (!id) return {};
  return {
    "X-Spine-Person": id.personId,
    "X-Spine-Role": id.role,
    "X-Spine-Name": encodeURIComponent(id.name),
  };
}

/** `fetch`, but saying who is asking. */
export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(identityHeaders())) if (!headers.has(k)) headers.set(k, v);
  return fetch(input, { ...init, headers });
}
