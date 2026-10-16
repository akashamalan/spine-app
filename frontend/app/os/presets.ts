/** Geometry for the SPINE desktop: where each window starts and how it is
 * kept on screen. Presets are percentages of the desktop area so the first
 * load looks the same on any monitor. */

export type WinId = "noticed" | "graph" | "answer" | "ask" | "vera" | "sim" | "start" | "settings";

export type Rect = { x: number; y: number; w: number; h: number };

/** The menu bar at the top and the strip the dock lives in at the bottom. */
export const MENU_H = 32;
export const DOCK_H = 88;

/** How much of a window's title bar must stay reachable after a drag. */
export const KEEP_VISIBLE = 80;
/** Title bar height, used so a window can never hide behind the dock. */
export const TITLE_H = 36;
/** Gap left around a maximized window. */
export const MAX_MARGIN = 12;

export const LAYOUT_KEY = "spine-os-layout-v1";

export type Preset = {
  /** x, y, w, h as percentages of the desktop area. */
  pct: Rect;
  open: boolean;
};

/** Reproduces the bento layout the app had before windows existed. */
export const PRESETS: Record<WinId, Preset> = {
  noticed: { pct: { x: 1, y: 1.5, w: 24, h: 97 }, open: true },
  graph: { pct: { x: 26, y: 1.5, w: 48, h: 44 }, open: true },
  answer: { pct: { x: 26, y: 47, w: 48, h: 40 }, open: true },
  ask: { pct: { x: 26, y: 89, w: 48, h: 9 }, open: true },
  vera: { pct: { x: 75, y: 1.5, w: 24, h: 97 }, open: true },
  // The company apps open on demand, centred, and are not part of the first look.
  sim: { pct: { x: 29, y: 4, w: 42, h: 92 }, open: false },
  start: { pct: { x: 30, y: 10, w: 40, h: 80 }, open: false },
  settings: { pct: { x: 32, y: 10, w: 36, h: 80 }, open: false },
};

export const WIN_IDS = Object.keys(PRESETS) as WinId[];

/** Below this width only the graph and the answer open by default. */
export const NARROW = 1100;

/** The usable rectangle: the viewport minus the menu bar and the dock strip. */
export function desktopArea(vw: number, vh: number): Rect {
  return { x: 0, y: MENU_H, w: vw, h: Math.max(200, vh - MENU_H - DOCK_H) };
}

export function fromPct(pct: Rect, area: Rect): Rect {
  return {
    x: area.x + (pct.x / 100) * area.w,
    y: area.y + (pct.y / 100) * area.h,
    w: (pct.w / 100) * area.w,
    h: (pct.h / 100) * area.h,
  };
}

export function toPct(rect: Rect, area: Rect): Rect {
  return {
    x: ((rect.x - area.x) / area.w) * 100,
    y: ((rect.y - area.y) / area.h) * 100,
    w: (rect.w / area.w) * 100,
    h: (rect.h / area.h) * 100,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Keep a window reachable: never under the menu bar, never behind the dock,
 * and always with a grabbable strip of title bar on screen. */
export function clampRect(rect: Rect, area: Rect): Rect {
  return {
    ...rect,
    x: clamp(rect.x, area.x + KEEP_VISIBLE - rect.w, area.x + area.w - KEEP_VISIBLE),
    y: clamp(rect.y, area.y, area.y + area.h - TITLE_H),
  };
}

/** The rectangle a maximized window fills. */
export function maxRect(area: Rect): Rect {
  return {
    x: area.x + MAX_MARGIN,
    y: area.y + MAX_MARGIN,
    w: area.w - MAX_MARGIN * 2,
    h: area.h - MAX_MARGIN * 2,
  };
}
