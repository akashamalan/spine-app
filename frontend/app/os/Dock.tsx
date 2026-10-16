"use client";

/**
 * The dock.
 *
 * Adapted from the React Bits "Dock" component
 * (MIT + Commons Clause License Condition v1.0, Copyright (c) 2026 David Haz).
 * Its magnification curve, hop and badge/tooltip behaviour are kept; the rest
 * is rewritten for SPINE: TypeScript, one edge instead of four, one dark
 * theme on our glass, a running/minimized indicator in place of the single
 * active dot, a single clean arc per hop so a bounce can be counted, and the
 * context-menu hook handed out to the shell rather than drawn here.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import "./Dock.css";

export type DockItem = {
  key: string;
  icon: ReactNode;
  label: string;
  /** Filled dot while open, hollow dot while minimized, nothing when closed. */
  indicator?: "running" | "minimized";
  /** Hidden at zero, so a quiet dock stays quiet. */
  badge?: number;
  onClick: () => void;
  onContextMenu?: (e: ReactMouseEvent | { clientX: number; clientY: number }) => void;
};

export type DockEntry = DockItem | { separator: true };

export type DockHandle = {
  /** One clean arc per call, queued; used for the Vera moment. */
  bounce: (key: string, times?: number) => void;
};

const isItem = (e: DockEntry): e is DockItem => !("separator" in e);

/** Tile sizes. The dock drops to the smaller tile on a narrower screen and
 * never wraps to a second row. */
const BASE = 52;
const BASE_NARROW = 44;
const NARROW = 1100;
const PEAK = 1.34; // magnified tile = BASE * PEAK
const REACH = 190; // how far along the dock the magnification is felt
const GAP = 10;
const PAD = 12;
const HOP_H = 0.34; // arc height as a fraction of the tile
const HOP_MS = 360;
const HOLD_MS = 450; // long-press opens the context menu on a touch screen

export function Dock({
  items,
  handle,
  /** Lets the shell record where each icon is, so minimize can fly into it. */
  onRegister,
}: {
  items: DockEntry[];
  handle?: RefObject<DockHandle | null>;
  onRegister?: (key: string, el: HTMLElement | null) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // The animation loop lives outside React and reads the latest list from here.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  /** Per-tile animation state, keyed by index. */
  const motion = useRef(new Map<number, { size: number; v: number; lift: number; t: number; queued: number }>());
  const wake = useRef<() => void>(() => {});
  const hopRef = useRef<(i: number, times: number) => void>(() => {});
  const pressRef = useRef<{ timer: number; cleanup: () => void } | null>(null);
  const skipClick = useRef(-1);

  useImperativeHandle(
    handle,
    () => ({
      bounce: (key, times = 2) => {
        const i = itemsRef.current.findIndex((e) => isItem(e) && e.key === key);
        if (i >= 0) hopRef.current(i, times);
      },
    }),
    []
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const pointer = { at: 0, inside: false };
    let focused = -1;
    let raf = 0;
    let last = 0;
    let alive = true;

    const base = () => (window.innerWidth < NARROW ? BASE_NARROW : BASE);

    const entry = (i: number) => {
      let s = motion.current.get(i);
      if (!s) {
        s = { size: base(), v: 0, lift: 0, t: -1, queued: 0 };
        motion.current.set(i, s);
      }
      return s;
    };

    const tick = (now: number) => {
      raf = 0;
      if (!alive) return;
      const dt = Math.min(1 / 30, Math.max(0.001, (now - last) / 1000));
      last = now;

      const b = base();
      // Badge and dot sizes follow the tile, which shrinks on a narrow screen.
      root.style.setProperty("--dock-base", `${b}px`);
      const peak = b * PEAK;
      const list = itemsRef.current;
      const rect = root.getBoundingClientRect();
      const centre = rect.left + rect.width / 2;

      // Resting centre of every tile, measured from the dock's middle.
      const spans = list.map((e) => (isItem(e) ? b : 1));
      const total = spans.reduce((a, s) => a + s, 0) + GAP * Math.max(0, spans.length - 1);
      let cursor = -total / 2;
      const rest = spans.map((s) => {
        const mid = cursor + s / 2;
        cursor += s + GAP;
        return mid;
      });

      let focus: number | null = null;
      if (pointer.inside) focus = pointer.at - centre;
      else if (rest[focused] !== undefined) focus = rest[focused];

      // Enough substeps that the spring stays stable on a slow frame.
      const steps = Math.max(1, Math.ceil(dt * 240));
      const h = dt / steps;
      const k = 150 / 0.1;
      const c = 12 / 0.1;
      let moving = false;

      list.forEach((item, i) => {
        const node = itemRefs.current[i];
        if (!node || !isItem(item)) return;
        const s = entry(i);

        // React Bits' falloff: a cosine-squared bump REACH px wide.
        const reach = focus === null ? 1 : Math.abs(focus - rest[i]) / REACH;
        const target = b + (peak - b) * (reach < 1 ? Math.cos((reach * Math.PI) / 2) ** 2 : 0);

        if (reduce) {
          s.size = target;
          s.v = 0;
        } else {
          for (let n = 0; n < steps; n++) {
            s.v = (s.v + h * k * (target - s.size)) / (1 + h * c + h * h * k);
            s.size += s.v * h;
          }
        }
        if (Math.abs(s.v) < 0.01 && Math.abs(target - s.size) < 0.01) {
          s.size = target;
          s.v = 0;
        } else {
          moving = true;
        }

        // One parabolic arc per hop, so "bounce twice" means exactly twice.
        if (s.t >= 0) {
          s.t += (dt * 1000) / HOP_MS;
          if (s.t >= 1) {
            s.lift = 0;
            if (s.queued > 0) {
              s.queued -= 1;
              s.t = 0;
            } else {
              s.t = -1;
              node.removeAttribute("data-hop");
            }
          } else {
            s.lift = s.size * HOP_H * 4 * s.t * (1 - s.t);
          }
          moving = true;
        }

        const size = Math.max(1, s.size);
        const tile = node.firstElementChild as HTMLElement | null;
        node.style.width = `${size}px`;
        node.style.height = `${size}px`;
        if (tile) tile.style.transform = `translate(0, ${-s.lift}px) scale(${size / b})`;
      });

      if (moving) raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (raf || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    wake.current = start;

    hopRef.current = (i, times) => {
      if (reduce) return;
      const s = entry(i);
      const node = itemRefs.current[i];
      if (s.t >= 0) {
        s.queued = Math.max(s.queued, times - 1);
      } else {
        s.t = 0;
        s.queued = Math.max(0, times - 1);
        node?.setAttribute("data-hop", "");
      }
      start();
    };

    const onMove = (e: PointerEvent) => {
      pointer.at = e.clientX;
      pointer.inside = true;
      start();
    };
    const onLeave = () => {
      pointer.inside = false;
      start();
    };
    const onFocusIn = (e: FocusEvent) => {
      const i = itemRefs.current.indexOf(e.target as HTMLButtonElement);
      focused = i;
      start();
    };
    const onFocusOut = () => {
      focused = -1;
      start();
    };
    const onResize = () => start();

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerdown", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("pointercancel", onLeave);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    window.addEventListener("resize", onResize);
    start();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerdown", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointercancel", onLeave);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("resize", onResize);
      wake.current = () => {};
      hopRef.current = () => {};
      pressRef.current?.cleanup();
    };
  }, []);

  // A new or removed icon changes every resting position.
  useEffect(() => {
    wake.current();
  });

  const endPress = useCallback(() => {
    const p = pressRef.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    p.cleanup();
    pressRef.current = null;
  }, []);

  /** Touch has no right-click, so a long press opens the menu instead. */
  const startPress = (e: React.PointerEvent<HTMLButtonElement>, i: number, item: DockItem) => {
    endPress();
    const id = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const target = e.currentTarget;
    if (target.hasPointerCapture?.(id)) target.releasePointerCapture(id);
    const onMove = (m: PointerEvent) => {
      if (m.pointerId === id && Math.hypot(m.clientX - x0, m.clientY - y0) > 8) endPress();
    };
    const onUp = (u: PointerEvent) => {
      if (u.pointerId === id) endPress();
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      pressRef.current = null;
      skipClick.current = i;
      item.onContextMenu?.({ clientX: x0, clientY: y0 });
    }, HOLD_MS);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    pressRef.current = { timer, cleanup };
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, i: number, item: DockItem) => {
    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      const r = e.currentTarget.getBoundingClientRect();
      item.onContextMenu?.({ clientX: r.left + r.width / 2, clientY: r.top });
      if (item.onContextMenu) e.preventDefault();
      return;
    }
    const order = items.flatMap((entry, n) => (isItem(entry) ? [n] : []));
    const at = order.indexOf(i);
    let next: number | undefined;
    if (e.key === "ArrowLeft") next = order[(at - 1 + order.length) % order.length];
    else if (e.key === "ArrowRight") next = order[(at + 1) % order.length];
    else if (e.key === "Home") next = order[0];
    else if (e.key === "End") next = order[order.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    itemRefs.current[next]?.focus();
  };

  return (
    <div
      ref={rootRef}
      className="dock glass"
      role="toolbar"
      aria-label="Dock"
      aria-orientation="horizontal"
      style={
        {
          "--dock-base": `${BASE}px`,
          "--dock-gap": `${GAP}px`,
          "--dock-pad": `${PAD}px`,
        } as React.CSSProperties
      }
    >
      {items.map((entry, i) =>
        !isItem(entry) ? (
          <span key={`sep-${i}`} className="dock-separator" aria-hidden />
        ) : (
          <button
            key={entry.key}
            ref={(node) => {
              itemRefs.current[i] = node;
              onRegister?.(entry.key, node);
            }}
            type="button"
            className="dock-item"
            aria-label={
              entry.badge
                ? `${entry.label}, ${entry.badge} ${entry.badge === 1 ? "item" : "items"} waiting`
                : entry.label
            }
            aria-haspopup={entry.onContextMenu ? "menu" : undefined}
            onPointerDown={(e) => {
              if (entry.onContextMenu && e.button === 0 && !e.ctrlKey) startPress(e, i, entry);
            }}
            onContextMenu={(e) => {
              if (!entry.onContextMenu) return;
              e.preventDefault();
              endPress();
              entry.onContextMenu(e);
            }}
            onClick={() => {
              if (skipClick.current === i) {
                skipClick.current = -1;
                return;
              }
              hopRef.current(i, 1);
              entry.onClick();
            }}
            onKeyDown={(e) => onKeyDown(e, i, entry)}
          >
            <span className="dock-tile">
              <span className="dock-face">{entry.icon}</span>
              {entry.badge ? <span className="dock-badge">{entry.badge}</span> : null}
            </span>
            {entry.indicator ? (
              <span className="dock-dot" data-hollow={entry.indicator === "minimized" ? "" : undefined} aria-hidden />
            ) : null}
            <span className="dock-label" aria-hidden>
              {entry.label}
            </span>
          </button>
        )
      )}
    </div>
  );
}
