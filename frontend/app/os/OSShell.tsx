"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../lib/motion";
import type { BackendStatus, Claim, Evidence, FeedbackResult, Finding, Toast, VeraProbe } from "../lib/types";
import type { Identity } from "../lib/identity";
import { usePrefs } from "../lib/uiPrefs";
import { VeraList } from "../components/VeraList";
import { Dock, type DockEntry, type DockHandle } from "./Dock";
import { MenuBar } from "./MenuBar";
import { VeraNotifications } from "./Notifications";
import { Window } from "./Window";
import { GettingStarted } from "./apps/GettingStarted";
import { Settings } from "./apps/Settings";
import { Directory } from "./apps/Directory";
import { Facts } from "./apps/Facts";
import { Activity } from "./apps/Activity";
import { useVeraHistory } from "../lib/useVeraHistory";
import { ContextMenuProvider, useContextMenu } from "./context/ContextMenuProvider";
import { ActionsProvider, type Actions, type GraphApi } from "./context/actions";
import { useMenus } from "./context/menus";
import { DOCK_ORDER, META, WINDOWS } from "./windows.config";
import { WIN_IDS, type WinId } from "./presets";
import { WindowProvider, useIsFocused, useWindows } from "./windowStore";

export type OSPanels = {
  noticed: ReactNode;
  graph: ReactNode;
  answer: ReactNode;
  ask: ReactNode;
  /** The admin-only Simulation window. */
  sim: ReactNode;
};

/** What the desktop needs from SPINE itself, handed over by the home screen so
 * windows and menus can act without knowing how the app is wired. */
export type ShellBridge = {
  claims: Claim[];
  findings: Finding[];
  resolvedThisWeek: number | null;
  evidence: Evidence[];
  /** Submit a question. */
  ask: (q: string) => void;
  /** Why asking is not possible right now, in plain words, or null. */
  askProblem: string | null;
  notify: (toast: Toast) => void;
  highlight: (id: string | null) => void;
  showFinding: (f: Finding) => void;
  graphApi: RefObject<GraphApi | null>;
  veraAsk: (claimIds: string[], note?: string) => Promise<boolean>;
  feedback: () => Promise<FeedbackResult>;
};

type ShellProps = {
  panels: OSPanels;
  bridge: ShellBridge;
  probes: VeraProbe[];
  probesReady: boolean;
  identity: Identity;
  onSwitchPerson: () => void;
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
      <ContextMenuProvider>
        <Shell {...props} />
      </ContextMenuProvider>
    </WindowProvider>
  );
}

const ONBOARDED = "spine-onboarded";
/** Windows that are tools rather than part of the workspace: "Show all" and
 * "Tidy" leave them alone. */
const isUtility = (id: WinId) => id === "start" || id === "settings";

function Shell({
  panels,
  bridge,
  probes,
  probesReady,
  identity,
  onSwitchPerson,
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
  const { state, open, close, tidy, dockActivate, dockIcons, toggleMax } = useWindows();
  const dock = useRef<DockHandle | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const veraInFront = useIsFocused("vera");
  const prefs = usePrefs();
  const isAdmin = identity.role === "admin";
  // Windows this person may have. The server still guards what they call;
  // this is only what is offered.
  const allowed = useMemo(() => WINDOWS.filter((w) => !w.admin || isAdmin).map((w) => w.id), [isAdmin]);
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

  const { ask, askProblem, notify, claims, findings, resolvedThisWeek, evidence, highlight: setFocusId, showFinding, graphApi, veraAsk, feedback } = bridge;

  // Everything a right-click menu may do, in one object. `askSpine` is the
  // one way any menu or button asks a question: it makes sure the places the
  // answer will appear are open, then submits.
  const actions = useMemo<Actions>(
    () => ({
      me: identity,
      isAdmin,
      claims,
      answer: answerText,
      evidence,
      allowed: allowed.filter((id) => !isUtility(id)),
      focusAsk,
      openWindow: reveal,
      notify,
      highlight: (id) => {
        if (id) reveal("graph");
        setFocusId(id);
      },
      showFinding: (f) => {
        reveal("graph");
        reveal("answer");
        showFinding(f);
      },
      graphApi,
      veraAsk,
      feedback,
      scan: onScan,
      copy: (text, what) => {
        navigator.clipboard
          .writeText(text)
          .then(() => notify({ title: `${what ?? "Text"} copied.`, lines: [] }))
          .catch(() => notify({ title: "Couldn't copy.", lines: ["Your browser blocked the clipboard."] }));
      },
      askSpine: (text) => {
        if (askProblem) {
          notify({ title: "I can't ask that right now.", lines: [askProblem] });
          return;
        }
        reveal("ask");
        reveal("graph");
        reveal("answer");
        ask(text);
      },
    }),
    [identity, isAdmin, claims, answerText, evidence, allowed, focusAsk, reveal, notify, setFocusId, showFinding, graphApi, veraAsk, feedback, onScan, askProblem, ask]
  );

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

  // First visit in this browser: show Getting started, once.
  const greeted = useRef(false);
  useEffect(() => {
    if (!state.ready || greeted.current) return;
    greeted.current = true;
    try {
      if (!localStorage.getItem(ONBOARDED)) {
        localStorage.setItem(ONBOARDED, "1");
        open("start");
      }
    } catch {
      // Storage blocked: it just won't remember having shown it.
    }
  }, [state.ready, open]);

  // Ctrl/⌘+K asks; Alt+1…8 open a window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusAsk();
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const hit = WINDOWS.find((w) => w.accel !== undefined && String(w.accel) === e.key && allowed.includes(w.id));
        if (hit) {
          e.preventDefault();
          reveal(hit.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusAsk, reveal, allowed]);

  // A freshly arrived question stays lit just long enough to be noticed.
  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(t);
  }, [highlight]);

  // Re-read the apps' data whenever something new arrives on the stream.
  const refreshKey = `${findings.length}:${probes.length}`;
  const { items: history } = useVeraHistory(refreshKey);

  const badge = (id: WinId) => {
    if (id === "vera") return probes.length;
    if (id === "noticed") return urgentCount;
    // Facts "probably outdated": below the 60% floor, as the Facts window labels them.
    if (id === "facts") return claims.filter((c) => c.confidence < 0.6).length;
    return 0;
  };

  // Dividers only where there are icons on both sides of them.
  const order = DOCK_ORDER.filter((e) => e === "divider" || allowed.includes(e)).filter(
    (e, i, all) => e !== "divider" || (i > 0 && i < all.length - 1 && all[i - 1] !== "divider")
  );
  const dockItems: DockEntry[] = order.map((entry) => {
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

  // "Only my questions" is a view over the list the server already filtered.
  const shownProbes = prefs.veraOnlyMine
    ? probes.filter((p) => p.aimed_at?.some((a) => a.id === identity.personId))
    : probes;

  const content: Record<WinId, ReactNode> = {
    noticed: panels.noticed,
    graph: panels.graph,
    // Unlike Bento (where the Panel wrapper supplies px-6), a window's
    // content div gives no horizontal padding of its own, so the answer
    // needs its own, matching Vera's wrapper below.
    answer: (
      <div className="min-h-0 flex-1 overflow-hidden px-5 pb-4 pt-1">
        {panels.answer}
      </div>
    ),
    ask: <div data-ask-root>{panels.ask}</div>,
    sim: panels.sim,
    directory: <Directory refreshKey={refreshKey} />,
    facts: <Facts claims={claims} findings={findings} resolvedThisWeek={resolvedThisWeek} history={history} />,
    activity: <Activity findings={findings} probes={probes} history={history} isAdmin={isAdmin} refreshKey={refreshKey} />,
    start: <GettingStarted onAsk={(q) => actions.askSpine(q, { source: "getting-started" })} onSkip={() => close("start")} />,
    settings: <Settings identity={identity} onSwitchPerson={onSwitchPerson} onResetLayout={tidy} />,
    vera: (
      <div className="min-h-0 flex-1 overflow-hidden px-5 pb-4 pt-1">
        <VeraList probes={shownProbes} onAnswer={onAnswerVera} highlight={highlight} />
      </div>
    ),
  };

  const graphMaxed = state.wins.graph.open && !state.wins.graph.minimized && state.wins.graph.maximized;
  const answerStrip = graphMaxed && (askStatus === "asking" || askStatus === "done");

  return (
    <ActionsProvider value={actions}>
      <MenuBar
        stats={stats}
        findingCount={findingCount}
        questionCount={probes.length}
        backend={backend}
        isScanning={isScanning}
        onScan={onScan}
        onAskFocus={focusAsk}
        identity={identity}
        allowed={allowed}
        onSwitchPerson={onSwitchPerson}
      />

      <WallpaperLayer />

      {/* The desktop: windows live between the menu bar and the dock. */}
      <div className="pointer-events-none fixed inset-0 z-10">
        <AnimatePresence initial={false}>
          {WIN_IDS.filter((id) => allowed.includes(id) && state.ready && state.wins[id].open).map((id) => (
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
        // A different person is a fresh start: none of their list is news.
        key={`${identity.personId}:${identity.role}`}
        probes={probes}
        ready={probesReady}
        veraInFront={veraInFront}
        onBounce={() => dock.current?.bounce("vera", 2)}
        onOpenProbe={(taskId) => {
          reveal("vera");
          setHighlight(taskId);
        }}
        onHighlight={(taskId) => setHighlight(taskId)}
      />

      <ShellDock items={dockItems} handle={dock} onRegister={(key, el) => dockIcons.current.set(key as WinId, el)} />
    </ActionsProvider>
  );
}

/** Right-clicking the bare wallpaper. It sits behind every window, so a
 * click on a window never reaches it. */
function WallpaperLayer() {
  const menus = useMenus();
  const { openMenu } = useContextMenu();
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[5]"
      onContextMenu={(e) => menus && openMenu(e, menus.wallpaper())}
    />
  );
}

function ShellDock({
  items,
  handle,
  onRegister,
}: {
  items: DockEntry[];
  handle: RefObject<DockHandle | null>;
  onRegister: (key: string, el: HTMLElement | null) => void;
}) {
  const menus = useMenus();
  const { openMenu } = useContextMenu();
  const withMenus = items.map((it) =>
    "separator" in it
      ? it
      : { ...it, onContextMenu: (e: Parameters<typeof openMenu>[0]) => menus && openMenu(e, menus.dock(it.key as WinId)) }
  );
  return <Dock items={withMenus} handle={handle} onRegister={onRegister} />;
}
