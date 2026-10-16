"use client";

import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../lib/motion";
import type { BackendStatus, Toast } from "../lib/types";
import { avatarStyle, initials } from "../lib/people";
import { CountUp } from "./CountUp";
import type { MobileView } from "./Bento";

const SPRING = { type: "spring", bounce: 0, duration: 0.4 } as const;

/** Plain-words health of the backend, shared by the dot and the outage toasts. */
function health(backend: BackendStatus): { dot: string; label: string } {
  if (backend.graph === "down")
    return { dot: "bg-stale", label: "Can't reach the graph. Retrying every 10 seconds." };
  if (backend.graph === "up" && !backend.llmOk)
    return { dot: "bg-aging", label: "Connected, but answers use a simple fallback right now." };
  if (backend.graph === "up") return { dot: "bg-fresh", label: "Connected. Everything is working." };
  return { dot: "bg-white/50", label: "Connecting to SPINE…" };
}

export function TopPill({
  backend,
  isScanning,
  onScan,
}: {
  backend: BackendStatus;
  isScanning: boolean;
  onScan: () => void;
}) {
  const h = health(backend);
  const offline = backend.graph !== "up";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
      <nav
        aria-label="SPINE"
        className="glass-thin pointer-events-auto flex h-12 items-center gap-3 rounded-full pl-5 pr-2"
      >
        <span className="text-[15px] font-semibold tracking-[0.12em]">SPINE</span>
        <span
          role="img"
          aria-label={h.label}
          title={h.label}
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${h.dot}`}
        />
        <span className="h-5 w-px bg-white/15" aria-hidden />
        <button
          type="button"
          onClick={onScan}
          disabled={isScanning || offline}
          title={offline ? "SPINE can't reach the graph right now" : "Look for new problems now"}
          className="flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium text-white transition-[transform,background-color] hover:bg-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {isScanning && (
            <span
              aria-hidden
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
            />
          )}
          {isScanning ? "Checking…" : "Scan now"}
        </button>
        <span
          className="flex h-9 items-center gap-2 rounded-full bg-white/[0.06] pl-1 pr-3 text-[13px]"
          title="You're not signed in yet"
        >
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-full text-[13px] font-semibold"
            style={avatarStyle("You")}
          >
            {initials("You").slice(0, 1)}
          </span>
          You
        </span>
      </nav>
    </div>
  );
}

/** Red / amber outage notes that slide in under the top pill. */
export function OutageToasts({ backend }: { backend: BackendStatus }) {
  const reduce = useReducedMotion();
  const down = backend.graph === "down";
  const fallback = backend.graph === "up" && !backend.llmOk;
  const enter = reduce ? { opacity: 0 } : { opacity: 0, y: -12 };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[128px] z-30 flex justify-center px-4 md:top-[72px]">
      <AnimatePresence>
        {down && (
          <motion.div
            key="down"
            role="alert"
            initial={enter}
            animate={{ opacity: 1, y: 0 }}
            exit={enter}
            transition={SPRING}
            className="glass-strong pointer-events-auto flex max-w-xl items-start gap-3 rounded-2xl px-4 py-3"
          >
            <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-stale" />
            <p className="text-[13px] leading-snug text-white/90">
              <span className="font-semibold text-white">I couldn&apos;t reach the knowledge graph.</span>{" "}
              {backend.message} Retrying every 10 seconds — this clears on its own once it&apos;s back.
            </p>
          </motion.div>
        )}
        {fallback && (
          <motion.div
            key="fallback"
            role="status"
            initial={enter}
            animate={{ opacity: 1, y: 0 }}
            exit={enter}
            transition={SPRING}
            className="glass-strong pointer-events-auto flex max-w-xl items-start gap-3 rounded-2xl px-4 py-3"
          >
            <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-aging" />
            <p className="text-[13px] leading-snug text-white/90">
              <span className="font-semibold text-white">Answers are using a simple fallback.</span>{" "}
              {backend.message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function BottomPill({
  backend,
  facts,
  connections,
  findings,
  questions,
}: {
  backend: BackendStatus;
  facts: number;
  connections: number;
  findings: number;
  questions: number;
}) {
  const parts: [number, string, string][] = [
    [facts, "fact", "facts"],
    [connections, "connection", "connections"],
    [findings, "thing to look at", "things to look at"],
    [questions, "question for people", "questions for people"],
  ];
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-30 flex justify-center px-4">
      <p
        aria-live="polite"
        className="glass-thin pointer-events-auto flex min-h-9 flex-wrap items-center justify-center gap-x-2 rounded-full px-4 py-1.5 text-[13px] text-white/85"
      >
        {backend.graph === "down" ? (
          <>
            <span aria-hidden className="h-2 w-2 rounded-full bg-stale" />
            Can&apos;t reach the graph
          </>
        ) : backend.graph === "unknown" ? (
          "Connecting…"
        ) : (
          parts.map(([n, one, many], i) => (
            <span key={many} className="whitespace-nowrap">
              {i > 0 && <span aria-hidden className="mr-2 text-white/40">·</span>}
              <CountUp value={n} /> {n === 1 ? one : many}
            </span>
          ))
        )}
      </p>
    </div>
  );
}

/** One glass toast for things SPINE just did. */
export function ActionToast({ toast, onDismiss }: { toast: Toast | null; onDismiss: () => void }) {
  const reduce = useReducedMotion();
  const enter = reduce ? { opacity: 0 } : { opacity: 0, y: 12 };
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.title + toast.lines.join("|")}
            role="status"
            initial={enter}
            animate={{ opacity: 1, y: 0 }}
            exit={enter}
            transition={SPRING}
            className="glass-strong pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl py-3 pl-4 pr-2"
          >
            <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-fresh" />
            <div className="min-w-0">
              <p className="text-[15px] font-medium">{toast.title}</p>
              {toast.lines.map((line, i) => (
                <p key={i} className="text-[13px] leading-snug text-white/80">
                  {line}
                </p>
              ))}
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white active:scale-[0.97]"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const VIEWS: [MobileView, string][] = [
  ["noticed", "Noticed"],
  ["ask", "Ask"],
  ["vera", "Vera"],
];

/** Phones only: pick which one panel is on screen. */
export function MobileSwitcher({
  view,
  onChange,
}: {
  view: MobileView;
  onChange: (view: MobileView) => void;
}) {
  return (
    <div className="fixed inset-x-0 top-[72px] z-20 flex justify-center px-4 md:hidden">
      <div role="tablist" aria-label="Show panel" className="glass-thin flex rounded-full p-1">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => onChange(id)}
            className={`h-9 rounded-full px-4 text-[13px] font-medium transition-[transform,background-color] active:scale-[0.97] ${
              view === id ? "bg-white/15 text-white" : "text-white/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
