"use client";

import { useReducedMotion as useSystemReducedMotion } from "motion/react";
import { getPrefs, usePrefs } from "./uiPrefs";

/** The one "reduce motion" flag everything uses: the system setting, or the
 * person's own switch in Settings. Components import this instead of
 * motion's own hook so the Settings toggle really changes them. */
export function useReducedMotion(): boolean {
  const system = useSystemReducedMotion();
  const { motion } = usePrefs();
  return !!system || motion === "reduce";
}

/** Same flag for code that runs outside React (the dock's animation loop). */
export function prefersReducedMotion(): boolean {
  if (getPrefs().motion === "reduce") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
