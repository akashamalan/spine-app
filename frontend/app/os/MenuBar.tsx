"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import type { BackendStatus } from "../lib/types";
import { WINDOWS } from "./windows.config";
import { useWindows } from "./windowStore";

type Row = { label: string; shortcut?: string; checked?: boolean; onSelect: () => void };

const never = () => () => {};
const modHere = () => (/Mac|iP(hone|ad|od)/.test(navigator.userAgent) ? "⌘" : "Ctrl");
/** The server has no idea which keyboard this is, so it guesses Ctrl and the
 * browser corrects it on hydration. */
const useModKey = () => useSyncExternalStore(never, modHere, () => "Ctrl");

function Menu({
  name,
  rows,
  openName,
  setOpenName,
}: {
  name: string;
  rows: Row[];
  openName: string | null;
  setOpenName: (n: string | null) => void;
}) {
  const open = openName === name;
  const id = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(-1);

  useEffect(() => {
    if (!open || at < 0) return;
    const items = boxRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']");
    items?.[at]?.focus();
  }, [open, at]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setAt(-1);
          setOpenName(open ? null : name);
        }}
        // Once one menu is open, sliding across the bar opens the next.
        onPointerEnter={() => {
          if (!openName) return;
          setAt(-1);
          setOpenName(name);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpenName(name);
            setAt(0);
          }
        }}
        className={`rounded-md px-2.5 py-0.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-white ${
          open ? "bg-white/18 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
        }`}
      >
        {name}
      </button>
      {open && (
        <div
          ref={boxRef}
          id={id}
          role="menu"
          aria-label={name}
          className="glass-strong absolute left-0 top-full z-10 mt-1 min-w-[208px] rounded-xl p-1.5 shadow-2xl"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAt((v) => (v + 1) % rows.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAt((v) => (v <= 0 ? rows.length - 1 : v - 1));
            }
          }}
        >
          {rows.map((r) => (
            <button
              key={r.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpenName(null);
                r.onSelect();
              }}
              className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[15px] text-white/90 hover:bg-white/15 focus-visible:bg-white/15 focus-visible:outline-none"
            >
              <span className="grid w-4 shrink-0 place-items-center">
                {r.checked ? <Check aria-hidden size={13} /> : null}
              </span>
              <span className="flex-1 truncate">{r.label}</span>
              {r.shortcut && <span className="shrink-0 text-[13px] text-white/50">{r.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Clock() {
  // Rendered only after mount: the server has no idea what time it is here.
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }));
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return <span className="tabular-nums text-[13px] text-white/80">{now}</span>;
}

export function MenuBar({
  stats,
  findingCount,
  questionCount,
  backend,
  isScanning,
  onScan,
  onAskFocus,
}: {
  stats: { knowledgeNodes: number; knowledgeEdges: number };
  findingCount: number;
  questionCount: number;
  backend: BackendStatus;
  isScanning: boolean;
  onScan: () => void;
  onAskFocus: () => void;
}) {
  const { state, open, showAll, hideAll, tidy } = useWindows();
  const [openName, setOpenName] = useState<string | null>(null);
  const mod = useModKey();

  // A click anywhere else, or Esc, closes the menu — never a window.
  useEffect(() => {
    if (!openName) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest("[data-menubar]")) setOpenName(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpenName(null);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [openName]);

  const health =
    backend.graph === "down" ? "bg-stale" : findingCount > 0 ? "bg-aging" : "bg-fresh";

  return (
    <div
      data-menubar
      className="glass-thin fixed inset-x-0 top-0 z-[70] flex h-8 items-center gap-1 px-3 text-[13px]"
    >
      <span className="mr-1 flex items-center gap-1.5 pr-1 font-semibold tracking-tight">
        <span aria-hidden className="h-3 w-[3px] rounded-full bg-white/85" />
        SPINE
      </span>

      <Menu
        name="File"
        openName={openName}
        setOpenName={setOpenName}
        rows={[
          { label: "Ask a question", shortcut: `${mod}+K`, onSelect: onAskFocus },
          { label: isScanning ? "Scanning…" : "Scan now", onSelect: onScan },
        ]}
      />
      <Menu
        name="View"
        openName={openName}
        setOpenName={setOpenName}
        rows={[
          { label: "Show all windows", onSelect: showAll },
          { label: "Hide all windows", onSelect: hideAll },
          { label: "Tidy windows", onSelect: tidy },
        ]}
      />
      <Menu
        name="Window"
        openName={openName}
        setOpenName={setOpenName}
        rows={WINDOWS.map((w) => ({
          label: w.short,
          shortcut: `Alt+${w.accel}`,
          checked: state.wins[w.id].open,
          onSelect: () => open(w.id),
        }))}
      />

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-white/70 lg:inline">
          {stats.knowledgeNodes} facts · {stats.knowledgeEdges} connections · {findingCount} things to look at ·{" "}
          {questionCount} {questionCount === 1 ? "question" : "questions"} for people
        </span>
        <button
          type="button"
          onClick={onScan}
          disabled={isScanning}
          className="rounded-md px-2 py-0.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-white"
        >
          {isScanning ? "Scanning…" : "Scan now"}
        </button>
        <span className="flex items-center gap-1.5 text-white/75">
          <span aria-hidden className={`h-2 w-2 rounded-full ${health}`} />
          {backend.graph === "down"
            ? "SPINE can't reach the graph"
            : `${findingCount} need${findingCount === 1 ? "s" : ""} attention`}
        </span>
        <Clock />
      </div>
    </div>
  );
}
