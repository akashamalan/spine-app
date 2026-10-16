"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import { GripVertical } from "lucide-react";
import { KEEP_VISIBLE, TITLE_H, type WinId } from "./presets";
import { TitleBar } from "./TitleBar";
import { useIsFocused, useWindows } from "./windowStore";

/** A window lends the right end of its title bar to whatever it contains, so a
 * panel's own buttons (the graph's Fit, for one) travel with the chrome. It
 * also says whether it is filling the screen, which is what the graph used to
 * call "expanded". Outside a window — on a phone — the defaults apply. */
export type WindowChrome = { slot: HTMLElement | null; maximized: boolean };
const ChromeCtx = createContext<WindowChrome>({ slot: null, maximized: false });
export const useWindowChrome = () => useContext(ChromeCtx);

const EASE = [0.32, 0.72, 0, 1] as const;

export function Window({
  id,
  title,
  children,
  /** The ask bar is a bare capsule: no traffic lights, a grip instead. */
  bare = false,
}: {
  id: WinId;
  title: string;
  children: ReactNode;
  bare?: boolean;
}) {
  const { state, focus, move, dockIcons } = useWindows();
  const win = state.wins[id];
  const focused = useIsFocused(id);
  const reduce = useReducedMotion();
  const dragControls = useDragControls();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  /** Minimized windows stay mounted so nothing inside them restarts; they are
   * only hidden, and that is a visual detail of the flight animation rather
   * than React state, so it is written straight to the node. */
  const cardRef = useRef<HTMLDivElement>(null);
  // Captured once: a window restored from a saved layout as minimized has
  // nothing to fly out of, so it just starts stowed.
  const [startedMinimized] = useState(win.minimized);

  const { rect, area } = { rect: win.rect, area: state.area };
  const chrome = useMemo<WindowChrome>(() => ({ slot, maximized: win.maximized }), [slot, win.maximized]);

  // Position and size live in motion values so dragging and maximizing can
  // share them without fighting over the same style property.
  const x = useMotionValue(rect.x);
  const y = useMotionValue(rect.y);
  const w = useMotionValue(rect.w);
  const h = useMotionValue(rect.h);
  // The flight into the dock rides on the inner card, leaving x/y untouched.
  const flyX = useMotionValue(0);
  const flyY = useMotionValue(0);
  const scale = useMotionValue(1);
  const fade = useMotionValue(startedMinimized ? 0 : 1);
  const dragging = useRef(false);

  // Follow the store. A drag has already moved the values, so this is a no-op
  // afterwards; a maximize or a resize is what actually animates here.
  useEffect(() => {
    if (dragging.current) return;
    const dur = reduce ? 0 : 0.3;
    const opts = { duration: dur, ease: EASE } as const;
    const pairs: [MotionValue<number>, number][] = [
      [x, rect.x],
      [y, rect.y],
      [w, rect.w],
      [h, rect.h],
    ];
    const running = pairs
      .filter(([mv, to]) => Math.abs(mv.get() - to) > 0.5)
      .map(([mv, to]) => animate(mv, to, opts));
    return () => running.forEach((a) => a.stop());
  }, [rect.x, rect.y, rect.w, rect.h, reduce, x, y, w, h]);

  // Minimize: fly into this window's dock icon. Restore plays it backwards.
  useEffect(() => {
    // A window that was already minimized when the page loaded is simply
    // stowed; there is nothing to animate away from.
    if (win.minimized === startedMinimized && fade.get() === (win.minimized ? 0 : 1)) {
      if (cardRef.current) cardRef.current.style.visibility = win.minimized ? "hidden" : "visible";
      return;
    }

    const icon = dockIcons.current.get(id)?.getBoundingClientRect();
    const target = () => {
      if (!icon || reduce) return null;
      return {
        cx: icon.left + icon.width / 2 - (x.get() + w.get() / 2),
        cy: icon.top + icon.height / 2 - (y.get() + h.get() / 2),
        s: Math.max(0.05, icon.width / Math.max(1, w.get())),
      };
    };
    const opts = { duration: reduce ? 0.14 : 0.26, ease: EASE } as const;
    const t = target();
    let stopped = false;

    if (win.minimized) {
      const runs = [animate(fade, 0, opts)];
      if (t) runs.push(animate(flyX, t.cx, opts), animate(flyY, t.cy, opts), animate(scale, t.s, opts));
      Promise.all(runs.map((r) => r.finished))
        .then(() => {
          if (!stopped && cardRef.current) cardRef.current.style.visibility = "hidden";
        })
        .catch(() => {
          /* a restore interrupted the flight; it will set visibility itself */
        });
      return () => {
        stopped = true;
        runs.forEach((r) => r.stop());
      };
    }

    if (cardRef.current) cardRef.current.style.visibility = "visible";
    if (t) {
      flyX.set(t.cx);
      flyY.set(t.cy);
      scale.set(t.s);
    }
    const runs = [animate(fade, 1, opts), animate(flyX, 0, opts), animate(flyY, 0, opts), animate(scale, 1, opts)];
    return () => runs.forEach((r) => r.stop());
  }, [win.minimized, startedMinimized, reduce, id, dockIcons, fade, flyX, flyY, scale, x, y, w, h]);

  return (
    <motion.div
      role="group"
      aria-label={title}
      aria-hidden={win.minimized}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: reduce ? 0 : 0.18, ease: EASE }}
      // Capture, so clicking a button inside still raises the window first.
      onPointerDownCapture={() => focus(id)}
      drag
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragConstraints={{
        left: area.x + KEEP_VISIBLE - rect.w,
        right: area.x + area.w - KEEP_VISIBLE,
        top: area.y,
        bottom: area.y + area.h - TITLE_H,
      }}
      onDragStart={() => {
        dragging.current = true;
      }}
      onDragEnd={() => {
        dragging.current = false;
        move(id, x.get(), y.get());
      }}
      style={{ x, y, width: w, height: h, zIndex: win.z, pointerEvents: win.minimized ? "none" : "auto" }}
      className="absolute top-0 left-0"
    >
      <motion.div
        ref={cardRef}
        style={{
          x: flyX,
          y: flyY,
          scale,
          opacity: fade,
          visibility: startedMinimized ? "hidden" : "visible",
        }}
        className={`flex h-full w-full flex-col overflow-hidden rounded-[28px] ${
          focused ? "glass-strong" : "glass"
        }`}
      >
        {bare ? (
          // No traffic lights: a grip on the left edge is the whole chrome.
          <div className="flex h-full min-h-0 items-stretch">
            <div
              onPointerDown={(e) => dragControls.start(e)}
              title={`Move ${title}`}
              aria-label={`Move ${title}`}
              className="flex w-5 shrink-0 cursor-grab touch-none items-center justify-center text-white/35 hover:text-white/70 active:cursor-grabbing"
            >
              <GripVertical aria-hidden size={14} />
            </div>
            <div className="min-h-0 flex-1 py-2 pr-3">{children}</div>
          </div>
        ) : (
          <>
            <TitleBar
              id={id}
              title={title}
              focused={focused}
              onDragStart={(e) => dragControls.start(e)}
              right={<span ref={setSlot} className="flex items-center gap-1" />}
            />
            <ChromeCtx.Provider value={chrome}>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            </ChromeCtx.Provider>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
