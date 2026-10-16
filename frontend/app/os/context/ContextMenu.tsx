"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useReducedMotion } from "../../lib/motion";

export type MenuItem =
  | {
      type: "item";
      id: string;
      label: string;
      icon?: ReactNode;
      hint?: string;
      shortcut?: string;
      /** true, or the plain-words reason it can't be used (shown on hover). */
      disabled?: boolean | string;
      danger?: boolean;
      /** Ask first, in words, before running. Used by anything that writes. */
      confirm?: string;
      onSelect: () => void;
    }
  | { type: "submenu"; id: string; label: string; icon?: ReactNode; items: MenuItem[] }
  | { type: "separator" }
  | { type: "label"; text: string };

const MARGIN = 8;

const isActionable = (m: MenuItem) =>
  (m.type === "item" && !m.disabled) || m.type === "submenu";

/** One panel of the menu. Submenus are panels inside panels. */
function Panel({
  items,
  depth,
  label,
  onRun,
  onClose,
  onBack,
  focusFirst,
}: {
  items: MenuItem[];
  depth: number;
  label?: string;
  onRun: (item: Extract<MenuItem, { type: "item" }>) => void;
  onClose: () => void;
  onBack?: () => void;
  focusFirst: boolean;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(() => (focusFirst ? items.findIndex(isActionable) : -1));
  const [sub, setSub] = useState<number | null>(null);
  const [flip, setFlip] = useState(false);
  const buffer = useRef({ text: "", at: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const order = items.flatMap((m, i) => (isActionable(m) ? [i] : []));

  // Nested panels open to the right, or to the left when there's no room.
  useLayoutEffect(() => {
    if (depth === 0 || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    if (r.right > window.innerWidth - MARGIN) setFlip(true);
  }, [depth]);

  // Keyboard users land on the first item; pointer users on nothing.
  useEffect(() => {
    if (focusFirst && order.length) {
      rowRefs.current[order[0]]?.focus({ preventScroll: true });
    } else {
      ref.current?.focus({ preventScroll: true });
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Runs once, when the panel appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusRow = (i: number) => {
    setActive(i);
    rowRefs.current[i]?.focus({ preventScroll: true });
  };

  const activate = (i: number, viaKeyboard: boolean) => {
    const m = items[i];
    if (m.type === "submenu") {
      setSub(i);
      if (viaKeyboard) setActive(i);
    } else if (m.type === "item" && !m.disabled) {
      onRun(m);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    const at = order.indexOf(active);
    let handled = true;
    if (k === "ArrowDown") {
      if (order.length) focusRow(order[(at + 1) % order.length]);
      setSub(null);
    } else if (k === "ArrowUp") {
      if (order.length) focusRow(order[at <= 0 ? order.length - 1 : at - 1]);
      setSub(null);
    } else if (k === "Home" && order.length) focusRow(order[0]);
    else if (k === "End" && order.length) focusRow(order[order.length - 1]);
    else if ((k === "Enter" || k === " ") && active >= 0) activate(active, true);
    else if (k === "ArrowRight" && active >= 0 && items[active]?.type === "submenu") activate(active, true);
    else if (k === "ArrowLeft" && onBack) onBack();
    else if (k === "Escape") onClose();
    else if (k === "Tab") onClose();
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Type-ahead: letters typed in quick succession narrow to a label.
      const now = Date.now();
      buffer.current.text = now - buffer.current.at > 600 ? k.toLowerCase() : buffer.current.text + k.toLowerCase();
      buffer.current.at = now;
      const hit = order.find((i) => {
        const m = items[i];
        return "label" in m && m.label.toLowerCase().startsWith(buffer.current.text);
      });
      if (hit !== undefined) focusRow(hit);
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      data-ctx-menu=""
      onKeyDown={onKeyDown}
      className={`glass-strong z-[200] min-w-[220px] max-w-[320px] rounded-2xl p-1.5 shadow-2xl outline-none ${
        depth === 0 ? "fixed" : "absolute top-[-6px]"
      } ${depth > 0 ? (flip ? "right-full mr-1" : "left-full ml-1") : ""} ${reduce ? "ctx-fade" : "ctx-pop"}`}
      style={depth === 0 ? { visibility: "hidden" } : undefined}
    >
      {items.map((m, i) => {
        if (m.type === "separator") return <div key={i} role="separator" className="mx-2 my-1 h-px bg-white/12" />;
        if (m.type === "label")
          return (
            <div key={i} className="px-3 pb-1 pt-2 text-[13px] text-white/55">
              {m.text}
            </div>
          );
        const disabled = m.type === "item" && !!m.disabled;
        const reason = m.type === "item" && typeof m.disabled === "string" ? m.disabled : undefined;
        const isSub = m.type === "submenu";
        return (
          <div key={m.id} className="relative">
            <button
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={active === i ? 0 : -1}
              aria-disabled={disabled || undefined}
              aria-haspopup={isSub ? "menu" : undefined}
              aria-expanded={isSub ? sub === i : undefined}
              title={reason}
              data-active={active === i ? "" : undefined}
              onPointerEnter={() => {
                if (disabled) return;
                setActive(i);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => setSub(isSub ? i : null), isSub ? 120 : 0);
              }}
              onClick={() => {
                if (disabled) return;
                activate(i, false);
              }}
              className={`flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[15px] transition-colors focus-visible:outline-none ${
                disabled
                  ? "cursor-not-allowed text-white/40"
                  : m.type === "item" && m.danger
                    ? "text-stale hover:bg-white/10 data-[active]:bg-white/15"
                    : "text-white/92 hover:bg-white/10 data-[active]:bg-white/15"
              }`}
            >
              {m.icon && <span aria-hidden className="grid w-4 shrink-0 place-items-center">{m.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{m.label}</span>
              {m.type === "item" && m.hint && <span className="shrink-0 text-[13px] text-white/50">{m.hint}</span>}
              {m.type === "item" && m.shortcut && (
                <span className="shrink-0 text-[13px] text-white/50">{m.shortcut}</span>
              )}
              {isSub && <ChevronRight aria-hidden size={14} className="shrink-0 text-white/55" />}
            </button>
            {isSub && sub === i && (
              <Panel
                items={m.items}
                depth={depth + 1}
                label={m.label}
                onRun={onRun}
                onClose={onClose}
                onBack={() => {
                  setSub(null);
                  rowRefs.current[i]?.focus({ preventScroll: true });
                }}
                focusFirst={active === i}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The menu, placed at the pointer: clamped to the screen, flipped near an edge. */
export function ContextMenu({
  x,
  y,
  items,
  keyboard,
  onRun,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  keyboard: boolean;
  onRun: (item: Extract<MenuItem, { type: "item" }>) => void;
  onClose: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = wrap.current?.firstElementChild as HTMLElement | null;
    if (!panel) return;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    panel.style.left = `${Math.max(MARGIN, x + w > vw - MARGIN ? x - w : x)}px`;
    panel.style.top = `${Math.max(MARGIN, y + h > vh - MARGIN ? vh - h - MARGIN : y)}px`;
    panel.style.visibility = "visible";
  }, [x, y]);

  return (
    <div ref={wrap}>
      <Panel items={items} depth={0} onRun={onRun} onClose={onClose} focusFirst={keyboard} />
    </div>
  );
}
