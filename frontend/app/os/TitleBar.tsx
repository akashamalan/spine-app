"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { WinId } from "./presets";
import { useContextMenu } from "./context/ContextMenuProvider";
import { useMenus } from "./context/menus";
import { useWindows } from "./windowStore";

/** The three round buttons. Their glyphs only appear once the group is hovered
 * or keyboard-focused, so the chrome stays quiet until you reach for it. */
function Light({
  color,
  label,
  glyph,
  dim,
  onClick,
}: {
  color: string;
  label: string;
  glyph: ReactNode;
  dim: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="grid h-6 w-6 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-white"
    >
      <span
        aria-hidden
        className="grid h-3 w-3 place-items-center rounded-full text-[8px] font-bold leading-none text-black/55 transition-colors"
        style={{ background: dim ? "rgba(255,255,255,0.22)" : color }}
      >
        <span className="opacity-0 transition-opacity group-hover/lights:opacity-100 group-focus-within/lights:opacity-100">
          {glyph}
        </span>
      </span>
    </button>
  );
}

export function TitleBar({
  id,
  title,
  right,
  focused,
  onDragStart,
}: {
  id: WinId;
  title: string;
  right?: ReactNode;
  focused: boolean;
  /** Only the title bar starts a drag, so the graph canvas still pans. */
  onDragStart: (e: ReactPointerEvent) => void;
}) {
  const { close, minimize, toggleMax, state } = useWindows();
  const maximized = state.wins[id].maximized;
  const menus = useMenus();
  const { openMenu } = useContextMenu();

  return (
    <header
      onPointerDown={onDragStart}
      onDoubleClick={() => toggleMax(id)}
      onContextMenu={(e) => menus && openMenu(e, menus.titleBar(id))}
      className="flex h-9 shrink-0 cursor-grab touch-none items-center gap-2 px-3 active:cursor-grabbing"
    >
      <div className="group/lights flex -space-x-1 items-center">
        <Light color="#FF5F57" label="Close" glyph="×" dim={!focused} onClick={() => close(id)} />
        <Light color="#FEBC2E" label="Minimize" glyph="–" dim={!focused} onClick={() => minimize(id)} />
        <Light
          color="#28C840"
          label={maximized ? "Restore" : "Maximize"}
          glyph="⤢"
          dim={!focused}
          onClick={() => toggleMax(id)}
        />
      </div>
      <span
        className={`min-w-0 flex-1 truncate text-center text-[13px] font-medium transition-colors ${
          focused ? "text-white/90" : "text-white/45"
        }`}
      >
        {title}
      </span>
      <div
        className="flex shrink-0 items-center gap-1"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {right}
      </div>
    </header>
  );
}
