"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  LAYOUT_KEY,
  NARROW,
  PRESETS,
  WIN_IDS,
  clampRect,
  desktopArea,
  fromPct,
  maxRect,
  toPct,
  type Rect,
  type WinId,
} from "./presets";

/** Windows own no state of their own — everything about them lives here, and
 * everything about SPINE itself still lives in useSpine. */

export type WinState = {
  open: boolean;
  minimized: boolean;
  maximized: boolean;
  /** True once a person has dragged it, so a browser resize stops re-placing it. */
  moved: boolean;
  rect: Rect;
  /** Where to go back to when un-maximizing. */
  restore: Rect | null;
  z: number;
};

type State = {
  wins: Record<WinId, WinState>;
  area: Rect;
  top: number;
  /** False until the real viewport has been measured in the browser. */
  ready: boolean;
};

type Action =
  | { type: "init"; area: Rect; saved: Saved | null }
  | { type: "area"; area: Rect }
  | { type: "open"; id: WinId }
  | { type: "close"; id: WinId }
  | { type: "minimize"; id: WinId }
  | { type: "restore"; id: WinId }
  | { type: "toggleMax"; id: WinId }
  | { type: "focus"; id: WinId }
  | { type: "move"; id: WinId; x: number; y: number }
  | { type: "resetOne"; id: WinId }
  | { type: "tidy" }
  | { type: "showAll"; ids: WinId[] }
  | { type: "hideAll"; ids: WinId[] };

type SavedWin = {
  open: boolean;
  minimized: boolean;
  maximized: boolean;
  moved: boolean;
  pct: Rect;
};
type Saved = Partial<Record<WinId, SavedWin>>;

function blank(): State {
  // A placeholder used only for the first server render; `init` replaces it
  // with real geometry as soon as the browser reports a viewport.
  const area = desktopArea(1440, 900);
  const wins = {} as Record<WinId, WinState>;
  WIN_IDS.forEach((id, i) => {
    wins[id] = {
      open: false,
      minimized: false,
      maximized: false,
      moved: false,
      rect: fromPct(PRESETS[id].pct, area),
      restore: null,
      z: i + 1,
    };
  });
  return { wins, area, top: WIN_IDS.length, ready: false };
}

/** Which windows a fresh visit opens: everything, or just the two that matter
 * on a smaller screen where five would overlap into a mess. */
function defaultOpen(id: WinId, area: Rect): boolean {
  if (area.w >= NARROW) return PRESETS[id].open;
  return id === "graph" || id === "answer";
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "init": {
      const { area, saved } = action;
      const wins = {} as Record<WinId, WinState>;
      let top = 0;
      WIN_IDS.forEach((id, i) => {
        const s = saved?.[id];
        const moved = s?.moved ?? false;
        const rect = s && moved ? clampRect(fromPct(s.pct, area), area) : fromPct(PRESETS[id].pct, area);
        top = i + 1;
        wins[id] = {
          open: s?.open ?? defaultOpen(id, area),
          minimized: s?.minimized ?? false,
          maximized: s?.maximized ?? false,
          moved,
          rect: s?.maximized ? maxRect(area) : rect,
          restore: s?.maximized ? rect : null,
          z: top,
        };
      });
      return { wins, area, top, ready: true };
    }

    case "area": {
      const area = action.area;
      const wins = {} as Record<WinId, WinState>;
      for (const id of WIN_IDS) {
        const w = state.wins[id];
        if (w.maximized) {
          wins[id] = { ...w, rect: maxRect(area), restore: w.restore ? reflow(w.restore, state.area, area, w.moved, id) : null };
        } else {
          wins[id] = { ...w, rect: reflow(w.rect, state.area, area, w.moved, id) };
        }
      }
      return { ...state, wins, area };
    }

    case "open": {
      const w = state.wins[action.id];
      const top = state.top + 1;
      return {
        ...state,
        top,
        wins: { ...state.wins, [action.id]: { ...w, open: true, minimized: false, z: top } },
      };
    }

    case "close": {
      const w = state.wins[action.id];
      return { ...state, wins: { ...state.wins, [action.id]: { ...w, open: false, minimized: false } } };
    }

    case "minimize": {
      const w = state.wins[action.id];
      if (!w.open || w.minimized) return state;
      return { ...state, wins: { ...state.wins, [action.id]: { ...w, minimized: true } } };
    }

    case "restore": {
      const w = state.wins[action.id];
      const top = state.top + 1;
      return { ...state, top, wins: { ...state.wins, [action.id]: { ...w, minimized: false, z: top } } };
    }

    case "toggleMax": {
      const w = state.wins[action.id];
      const top = state.top + 1;
      const next: WinState = w.maximized
        ? { ...w, maximized: false, rect: w.restore ?? w.rect, restore: null, z: top }
        : { ...w, maximized: true, restore: w.rect, rect: maxRect(state.area), z: top };
      return { ...state, top, wins: { ...state.wins, [action.id]: next } };
    }

    case "focus": {
      const w = state.wins[action.id];
      if (w.z === state.top) return state;
      const top = state.top + 1;
      return { ...state, top, wins: { ...state.wins, [action.id]: { ...w, z: top } } };
    }

    case "move": {
      const w = state.wins[action.id];
      const rect = { ...w.rect, x: action.x, y: action.y };
      return { ...state, wins: { ...state.wins, [action.id]: { ...w, rect, moved: true } } };
    }

    case "resetOne": {
      const w = state.wins[action.id];
      const top = state.top + 1;
      return {
        ...state,
        top,
        wins: {
          ...state.wins,
          [action.id]: {
            ...w,
            moved: false,
            maximized: false,
            minimized: false,
            restore: null,
            rect: fromPct(PRESETS[action.id].pct, state.area),
            z: top,
          },
        },
      };
    }

    case "tidy": {
      const wins = {} as Record<WinId, WinState>;
      WIN_IDS.forEach((id, i) => {
        wins[id] = {
          open: defaultOpen(id, state.area),
          minimized: false,
          maximized: false,
          moved: false,
          rect: fromPct(PRESETS[id].pct, state.area),
          restore: null,
          z: i + 1,
        };
      });
      return { ...state, wins, top: WIN_IDS.length };
    }

    case "showAll": {
      const wins = { ...state.wins };
      for (const id of action.ids) wins[id] = { ...wins[id], open: true, minimized: false };
      return { ...state, wins };
    }

    case "hideAll": {
      const wins = { ...state.wins };
      for (const id of action.ids) if (wins[id].open) wins[id] = { ...wins[id], minimized: true };
      return { ...state, wins };
    }
  }
}

/** On a browser resize: untouched windows follow their preset, dragged ones
 * keep their place and are only pulled back into view. */
function reflow(rect: Rect, from: Rect, to: Rect, moved: boolean, id: WinId): Rect {
  if (!moved) return fromPct(PRESETS[id].pct, to);
  return clampRect(fromPct(toPct(rect, from), to), to);
}

function readSaved(): Saved | null {
  try {
    if (new URLSearchParams(window.location.search).get("layout") === "reset") {
      localStorage.removeItem(LAYOUT_KEY);
      return null;
    }
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const out: Saved = {};
    for (const id of WIN_IDS) {
      const v = (parsed as Record<string, unknown>)[id];
      if (!v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      const p = o.pct as Record<string, unknown> | undefined;
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
      out[id] = {
        open: !!o.open,
        minimized: !!o.minimized,
        maximized: !!o.maximized,
        moved: !!o.moved,
        pct: { x: p.x, y: p.y, w: Number(p.w) || 0, h: Number(p.h) || 0 },
      };
    }
    return out;
  } catch {
    // Storage blocked or corrupt: fall back to the preset layout.
    return null;
  }
}

type Ctx = {
  state: State;
  /** Where each dock icon is, so a minimize knows what to fly into. */
  dockIcons: React.RefObject<Map<WinId, HTMLElement | null>>;
  open: (id: WinId) => void;
  close: (id: WinId) => void;
  minimize: (id: WinId) => void;
  toggleMin: (id: WinId) => void;
  toggleMax: (id: WinId) => void;
  focus: (id: WinId) => void;
  move: (id: WinId, x: number, y: number) => void;
  resetOne: (id: WinId) => void;
  tidy: () => void;
  /** The ids are the windows this person is allowed to have. */
  showAll: (ids?: WinId[]) => void;
  hideAll: (ids?: WinId[]) => void;
  /** What a dock click should do, given what the window is doing now. */
  dockActivate: (id: WinId) => void;
};

const WindowCtx = createContext<Ctx | null>(null);

export function WindowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, blank);
  const dockIcons = useRef<Map<WinId, HTMLElement | null>>(new Map());

  // Measure the real viewport once mounted, then follow it (debounced).
  useEffect(() => {
    dispatch({ type: "init", area: desktopArea(window.innerWidth, window.innerHeight), saved: readSaved() });
    let t = 0;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(
        () => dispatch({ type: "area", area: desktopArea(window.innerWidth, window.innerHeight) }),
        120
      );
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Remember the layout. Percentages, so a different screen still makes sense.
  useEffect(() => {
    if (!state.ready) return;
    try {
      const out: Saved = {};
      for (const id of WIN_IDS) {
        const w = state.wins[id];
        out[id] = {
          open: w.open,
          minimized: w.minimized,
          maximized: w.maximized,
          moved: w.moved,
          pct: toPct(w.maximized ? (w.restore ?? w.rect) : w.rect, state.area),
        };
      }
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(out));
    } catch {
      // Storage blocked: the layout just won't survive a reload.
    }
  }, [state]);

  // The handful of actions that need to know what a window is doing read it
  // through here, so every callback below can keep the same identity for the
  // life of the shell. An effect that opens a window must not re-fire merely
  // because some other window moved.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const actions = useMemo(() => {
    const open = (id: WinId) => dispatch({ type: "open", id });
    const minimize = (id: WinId) => dispatch({ type: "minimize", id });
    return {
      open,
      close: (id: WinId) => dispatch({ type: "close", id }),
      minimize,
      toggleMin: (id: WinId) =>
        stateRef.current.wins[id].minimized ? dispatch({ type: "restore", id }) : minimize(id),
      toggleMax: (id: WinId) => dispatch({ type: "toggleMax", id }),
      focus: (id: WinId) => dispatch({ type: "focus", id }),
      move: (id: WinId, x: number, y: number) => dispatch({ type: "move", id, x, y }),
      resetOne: (id: WinId) => dispatch({ type: "resetOne", id }),
      tidy: () => dispatch({ type: "tidy" }),
      showAll: (ids: WinId[] = WIN_IDS) => dispatch({ type: "showAll", ids }),
      hideAll: (ids: WinId[] = WIN_IDS) => dispatch({ type: "hideAll", ids }),
      dockActivate: (id: WinId) => {
        const w = stateRef.current.wins[id];
        // Closed opens, minimized restores, open-but-behind comes forward.
        // A focused window is never minimized by its own dock icon.
        if (!w.open || w.minimized) open(id);
        else dispatch({ type: "focus", id });
      },
    };
  }, []);

  const value = useMemo<Ctx>(() => ({ state, dockIcons, ...actions }), [state, actions]);

  return <WindowCtx.Provider value={value}>{children}</WindowCtx.Provider>;
}

export function useWindows(): Ctx {
  const ctx = useContext(WindowCtx);
  if (!ctx) throw new Error("useWindows must be used inside <WindowProvider>");
  return ctx;
}

/** True when this window is the frontmost open one. */
export function useIsFocused(id: WinId): boolean {
  const { state } = useWindows();
  const w = state.wins[id];
  if (!w.open || w.minimized) return false;
  let top: WinId | null = null;
  for (const other of WIN_IDS) {
    const o = state.wins[other];
    if (!o.open || o.minimized) continue;
    if (!top || o.z > state.wins[top].z) top = other;
  }
  return top === id;
}

/** Opens and focuses a window without caring what it was doing before. */
export function useRevealWindow() {
  const { open } = useWindows();
  return useCallback((id: WinId) => open(id), [open]);
}
