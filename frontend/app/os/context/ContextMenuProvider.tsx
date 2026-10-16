"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ContextMenu, type MenuItem } from "./ContextMenu";

/** Anything that looks enough like a pointer event: a React or DOM
 * contextmenu event, or a plain point (the dock's long-press). */
export type OpenAt = {
  clientX: number;
  clientY: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
  shiftKey?: boolean;
  target?: EventTarget | null;
};

type Ctx = {
  /** Show a menu at the pointer. Does nothing (so the browser's own menu
   * appears) over text fields and whenever Shift is held. */
  openMenu: (e: OpenAt, items: MenuItem[]) => void;
  /** Ask in words before something that writes. Resolves true on "Yes". */
  confirm: (message: string, yes?: string) => Promise<boolean>;
  /** A small glass card anchored near a point. */
  showPopover: (at: { x: number; y: number }, node: ReactNode, title?: string) => void;
  closePopover: () => void;
};

const NOOP: Ctx = {
  openMenu: () => {},
  confirm: async () => false,
  showPopover: () => {},
  closePopover: () => {},
};

const MenuCtx = createContext<Ctx>(NOOP);
export const useContextMenu = () => useContext(MenuCtx);

const NATIVE = "input, textarea, select, [contenteditable=''], [contenteditable='true']";

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<{ id: number; x: number; y: number; items: MenuItem[]; keyboard: boolean } | null>(null);
  const [pop, setPop] = useState<{ x: number; y: number; node: ReactNode; title?: string } | null>(null);
  const [ask, setAsk] = useState<{ message: string; yes: string; resolve: (ok: boolean) => void } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const serial = useRef(0);

  const closeMenu = useCallback((restore = true) => {
    setMenu(null);
    if (restore) {
      const el = trigger.current;
      // Back to where the person was, if it is still there.
      if (el && document.contains(el)) el.focus?.({ preventScroll: true });
    }
  }, []);

  const closePopover = useCallback(() => setPop(null), []);

  const openMenu = useCallback((e: OpenAt, items: MenuItem[]) => {
    const target = e.target instanceof Element ? e.target : null;
    // The browser's own menu stays for text fields, and always on Shift.
    if (e.shiftKey || target?.closest(NATIVE)) return;
    e.preventDefault?.();
    e.stopPropagation?.();
    if (items.length === 0) return;
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let x = e.clientX;
    let y = e.clientY;
    // The ContextMenu key reports 0,0: open beside the focused element instead.
    const keyboard = x === 0 && y === 0 && !!target;
    if (keyboard) {
      const r = target!.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
    serial.current += 1;
    setPop(null);
    setMenu({ id: serial.current, x, y, items, keyboard });
  }, []);

  const confirm = useCallback(
    (message: string, yes = "Yes") =>
      new Promise<boolean>((resolve) => setAsk({ message, yes, resolve })),
    []
  );

  const showPopover = useCallback((at: { x: number; y: number }, node: ReactNode, title?: string) => {
    setMenu(null);
    setPop({ x: at.x, y: at.y, node, title });
  }, []);

  // A menu closes on a click elsewhere, scrolling, resizing, losing the
  // window, or another right-click.
  useEffect(() => {
    if (!menu) return;
    const inside = (t: EventTarget | null) => t instanceof Element && !!t.closest("[data-ctx-menu]");
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target)) closeMenu(false);
    };
    const onContext = (e: MouseEvent) => {
      if (!inside(e.target)) closeMenu(false);
    };
    const onScroll = (e: Event) => {
      if (!inside(e.target)) closeMenu(false);
    };
    const away = () => closeMenu(false);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("contextmenu", onContext, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", away);
    window.addEventListener("blur", away);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("contextmenu", onContext, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", away);
      window.removeEventListener("blur", away);
    };
  }, [menu, closeMenu]);

  // A popover closes the same ways, and on Esc.
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element && e.target.closest("[data-ctx-pop]"))) setPop(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPop(null);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", closePopover);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", closePopover);
    };
  }, [pop, closePopover]);

  const run = useCallback(
    (item: Extract<MenuItem, { type: "item" }>) => {
      closeMenu(!item.confirm);
      if (item.confirm) {
        confirm(item.confirm).then((ok) => ok && item.onSelect());
      } else {
        item.onSelect();
      }
    },
    [closeMenu, confirm]
  );

  const value = useMemo<Ctx>(
    () => ({ openMenu, confirm, showPopover, closePopover }),
    [openMenu, confirm, showPopover, closePopover]
  );

  return (
    <MenuCtx.Provider value={value}>
      {children}
      {menu &&
        createPortal(
          <ContextMenu
            key={menu.id}
            x={menu.x}
            y={menu.y}
            items={menu.items}
            keyboard={menu.keyboard}
            onRun={run}
            onClose={() => closeMenu(true)}
          />,
          document.body
        )}
      {pop && createPortal(<Popover {...pop} onClose={closePopover} />, document.body)}
      {ask &&
        createPortal(
          <ConfirmDialog
            message={ask.message}
            yes={ask.yes}
            onAnswer={(ok) => {
              ask.resolve(ok);
              setAsk(null);
            }}
          />,
          document.body
        )}
    </MenuCtx.Provider>
  );
}

/** A glass card near a point, kept on screen. */
function Popover({
  x,
  y,
  node,
  title,
  onClose,
}: {
  x: number;
  y: number;
  node: ReactNode;
  title?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    el.style.left = `${Math.max(8, Math.min(x, vw - w - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(y, vh - h - 8))}px`;
    el.style.visibility = "visible";
  }, [x, y]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={title ?? "Details"}
      data-ctx-pop=""
      style={{ visibility: "hidden" }}
      className="glass-strong ctx-pop fixed z-[210] w-[340px] max-w-[calc(100vw-16px)] rounded-2xl p-4 text-white shadow-2xl"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        {title && <h3 className="text-[15px] font-semibold leading-snug">{title}</h3>}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X aria-hidden size={15} />
        </button>
      </div>
      {node}
    </div>
  );
}

function ConfirmDialog({
  message,
  yes,
  onAnswer,
}: {
  message: string;
  yes: string;
  onAnswer: (ok: boolean) => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onAnswer(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onAnswer]);
  return (
    <div className="fixed inset-0 z-[220] grid place-items-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={message}
        className="glass-strong w-[360px] max-w-full rounded-2xl p-5 text-white shadow-2xl"
      >
        <p className="text-[15px] leading-snug">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onAnswer(false)}
            className="rounded-full px-4 py-2 text-[13px] text-white/80 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
          >
            Cancel
          </button>
          <button
            ref={first}
            type="button"
            onClick={() => onAnswer(true)}
            className="rounded-full bg-white/20 px-4 py-2 text-[13px] font-medium hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-white"
          >
            {yes}
          </button>
        </div>
      </div>
    </div>
  );
}
