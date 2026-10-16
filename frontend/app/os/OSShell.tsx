"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { BackendStatus, VeraProbe } from "../lib/types";
import { VeraList } from "../components/VeraList";
import { Dock, type DockEntry, type DockHandle } from "./Dock";
import { MenuBar } from "./MenuBar";
import { VeraNotifications } from "./Notifications";
import { Window } from "./Window";
import { DOCK_ORDER, META, WINDOWS } from "./windows.config";
import { WIN_IDS, type WinId } from "./presets";
import { WindowProvider, useIsFocused, useWindows } from "./windowStore";

export type OSPanels = {
  noticed: ReactNode;
  graph: ReactNode;
  answer: ReactNode;
  ask: ReactNode;
};

type ShellProps = {
  panels: OSPanels;
  probes: VeraProbe[];
  onAnswerVera: () => void;
  stats: { knowledgeNodes: number; knowledgeEdges: number };
  findingCount: number;
  urgentCount: number;
  backend: BackendStatus;
  isScanning: boolean;
  onScan: () => void;
  /** "asking" opens the graph and the answer even if they were put away. */
  askStatus: string;
  answerText: string;
};

export function OSShell(props: ShellProps) {
  return (
    <WindowProvider>
      <Shell {...props} />
    </WindowProvider>
  );
}

function Shell({
  panels,
  probes,
  onAnswerVera,
  stats,
  findingCount,
  urgentCount,
  backend,
  isScanning,
  onScan,
  askStatus,
  answerText,
}: ShellProps) {
  const { state, open, dockActivate, dockIcons, toggleMax } = useWindows();
  const dock = useRef<DockHandle | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const veraInFront = useIsFocused("vera");
  const reduce = useReducedMotion();

  /** Open a window and bring it forward. */
  const reveal = useCallback((id: WinId) => open(id), [open]);

  const focusAsk = useCallback(() => {
    reveal("ask");
    // The input is inside AskBar; reach it once the window is on screen.
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>("[data-ask-root] input")?.focus();
    });
  }, [reveal]);

  // A question always needs somewhere to land, even if it was put away. Only
  // the moment the question starts counts: shutting the answer away while it
  // streams must leave it shut, and must not stop the stream.
  const wasAsking = useRef(false);
  useEffect(() => {
    const asking = askStatus === "asking";
    if (asking && !wasAsking.current) {
      reveal("graph");
      reveal("answer");
    }
    wasAsking.current = asking;
  }, [askStatus, reveal]);

  // Ctrl/⌘+K asks; Alt+1…5 open a window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusAsk();
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const hit = WINDOWS.find((w) => String(w.accel) === e.key);
        if (hit) {
          e.preventDefault();
          reveal(hit.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusAsk, reveal]);

  // A freshly arrived question stays lit just long enough to be noticed.
  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(t);
  }, [highlight]);

  const badge = (id: WinId) => {
    if (id === "vera") return probes.length;
    if (id === "noticed") return urgentCount;
    return 0;
  };

  const dockItems: DockEntry[] = DOCK_ORDER.map((entry) => {
    if (entry === "divider") return { separator: true as const };
    const meta = META[entry];
    const w = state.wins[entry];
    return {
      key: entry,
      icon: meta.icon,
      label: meta.short,
      indicator: w.open ? (w.minimized ? ("minimized" as const) : ("running" as const)) : undefined,
      badge: badge(entry),
      onClick: () => dockActivate(entry),
    };
  });

  const content: Record<WinId, ReactNode> = {
    noticed: panels.noticed,
    graph: panels.graph,
    answer: panels.answer,
    ask: <div data-ask-root>{panels.ask}</div>,
    vera: (
      <div className="min-h-0 flex-1 overflow-hidden px-5 pb-4 pt-1">
        <VeraList probes={probes} onAnswer={onAnswerVera} highlight={highlight} />
      </div>
    ),
  };

  const graphMaxed = state.wins.graph.open && !state.wins.graph.minimized && state.wins.graph.maximized;
  const answerStrip = graphMaxed && (askStatus === "asking" || askStatus === "done");

  return (
    <>
      <MenuBar
        stats={stats}
        findingCount={findingCount}
        questionCount={probes.length}
        backend={backend}
        isScanning={isScanning}
        onScan={onScan}
        onAskFocus={focusAsk}
      />

      {/* The desktop: windows live between the menu bar and the dock. */}
      <div className="pointer-events-none fixed inset-0 z-10">
        <AnimatePresence initial={false}>
          {WIN_IDS.filter((id) => state.ready && state.wins[id].open).map((id) => (
            <Window key={id} id={id} title={META[id].title} bare={id === "ask"}>
              {content[id]}
            </Window>
          ))}
        </AnimatePresence>
      </div>

      {/* With the graph filling the screen, the answer still has to be readable. */}
      <AnimatePresence>
        {answerStrip && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={{ duration: 0.24 }}
            className="glass-strong fixed bottom-[104px] left-1/2 z-[65] w-[min(680px,calc(100vw-48px))] -translate-x-1/2 rounded-2xl px-4 py-3 shadow-2xl"
          >
            <p className="line-clamp-3 text-[15px] leading-snug">
              {askStatus === "asking" && !answerText ? "SPINE is working through your company…" : answerText}
            </p>
            <button
              type="button"
              onClick={() => {
                toggleMax("graph");
                reveal("answer");
              }}
              className="mt-2 rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-medium hover:bg-white/25 active:scale-[0.97]"
            >
              View evidence
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <VeraNotifications
        probes={probes}
        veraInFront={veraInFront}
        onBounce={() => dock.current?.bounce("vera", 2)}
        onOpenProbe={(taskId) => {
          reveal("vera");
          setHighlight(taskId);
        }}
        onHighlight={(taskId) => setHighlight(taskId)}
      />

      <Dock
        items={dockItems}
        handle={dock}
        onRegister={(key, el) => dockIcons.current.set(key as WinId, el)}
      />
    </>
  );
}
