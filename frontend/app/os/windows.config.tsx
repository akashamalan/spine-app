"use client";

import { FlaskConical, MessageSquare, Network, Sparkles, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { WinId } from "./presets";

/** One place that says what every window is called and which icon stands for
 * it, so the dock, the Window menu and the title bars can never disagree.
 *
 * The company apps (Directory, Facts, Activity, Simulation, Settings) are not
 * here yet: nothing would open, and a dock icon that does nothing is worse
 * than no icon at all. They arrive with their tiers.
 */
export type WinMeta = {
  id: WinId;
  title: string;
  /** Short name for the dock tooltip and the Window menu. */
  short: string;
  icon: ReactNode;
  /** Alt+<n> opens or focuses this window. */
  accel: number;
  /** Only administrators get this window; the server guards what it calls. */
  admin?: boolean;
};

const SIZE = 22;

export const WINDOWS: WinMeta[] = [
  { id: "ask", title: "Ask", short: "Ask", icon: <Sparkles aria-hidden size={SIZE} />, accel: 1 },
  { id: "graph", title: "How SPINE found it", short: "The graph", icon: <Network aria-hidden size={SIZE} />, accel: 2 },
  {
    id: "noticed",
    title: "What SPINE noticed",
    short: "What SPINE noticed",
    icon: <TriangleAlert aria-hidden size={SIZE} />,
    accel: 3,
  },
  { id: "answer", title: "The answer", short: "The answer", icon: <MessageSquare aria-hidden size={SIZE} />, accel: 4 },
  { id: "vera", title: "Vera", short: "Vera", icon: <VeraMark />, accel: 5 },
  { id: "sim", title: "Simulation", short: "Simulation", icon: <FlaskConical aria-hidden size={SIZE} />, accel: 6, admin: true },
];

export const META: Record<WinId, WinMeta> = WINDOWS.reduce(
  (acc, w) => ({ ...acc, [w.id]: w }),
  {} as Record<WinId, WinMeta>
);

/** Vera gets her own mark rather than a borrowed glyph. */
function VeraMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={SIZE} height={SIZE} fill="none" stroke="currentColor" strokeWidth={1.7}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.6 9.6a3.4 3.4 0 1 1 3.4 3.9" strokeLinecap="round" />
      <circle cx="12" cy="16.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The dock's running order, with the dividers between its groups. */
export const DOCK_ORDER: (WinId | "divider")[] = ["ask", "graph", "noticed", "answer", "vera", "divider", "sim"];
