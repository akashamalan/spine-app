"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../lib/motion";
import type { VeraProbe } from "../lib/types";
import { displayName } from "../lib/labels";

/** The Vera moment: when a scan raises a question that needs a person, the
 * dock icon hops twice and a card slides in under the menu bar. */

const LIFE_MS = 8000;
const MAX_STACK = 3;

type Card = { id: string; probe: VeraProbe };

function Note({
  card,
  onOpen,
  onDismiss,
}: {
  card: Card;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const reduce = useReducedMotion();
  const [paused, setPaused] = useState(false);

  // The parent hands over a fresh callback on every render, and a render
  // happens whenever findings stream in. Keep the latest one in a ref so the
  // 8 seconds are measured from the card's arrival, not from the last render.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => dismiss.current(), LIFE_MS);
    return () => clearTimeout(t);
  }, [paused]);

  const enter = reduce ? { opacity: 0 } : { opacity: 0, x: 24 };

  return (
    <motion.div
      layout={!reduce}
      initial={enter}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
      transition={{ type: "spring", bounce: 0, duration: 0.36 }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      role="status"
      className="glass-strong pointer-events-auto w-[320px] rounded-2xl p-3.5 shadow-2xl"
    >
      <p className="text-[13px] text-white/70">
        Vera is asking{" "}
        {card.probe.asked_of
          ? card.probe.asked_of.split(" ")[0]
          : `about ${displayName(card.probe.target_name, "something in the graph")}`}
      </p>
      <p className="mt-1 text-[15px] leading-snug">{card.probe.question}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full bg-white/18 px-3.5 py-1.5 text-[13px] font-medium hover:bg-white/25 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-white"
        >
          Open
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-full px-3.5 py-1.5 text-[13px] text-white/75 hover:bg-white/10 hover:text-white active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-white"
        >
          Later
        </button>
      </div>
    </motion.div>
  );
}

export function VeraNotifications({
  probes,
  /** False until the first list for this person has arrived. */
  ready,
  /** When Vera is already in front, the row lights up instead of a card. */
  veraInFront,
  onBounce,
  onOpenProbe,
  onHighlight,
}: {
  probes: VeraProbe[];
  ready: boolean;
  veraInFront: boolean;
  onBounce: () => void;
  onOpenProbe: (taskId: string) => void;
  onHighlight: (taskId: string) => void;
}) {
  const [cards, setCards] = useState<Card[]>([]);
  const seen = useRef<Set<string> | null>(null);
  // Read through a ref so a change of focus can't replay an old arrival.
  // Declared before the effect below so it is already current when that runs.
  const live = useRef({ veraInFront, onBounce, onOpenProbe, onHighlight });
  useEffect(() => {
    live.current = { veraInFront, onBounce, onOpenProbe, onHighlight };
  });

  useEffect(() => {
    // Nothing has been read for this person yet, so there is nothing to compare.
    if (!ready) {
      seen.current = null;
      return;
    }
    // The first list is simply what was already waiting; only what turns up
    // afterwards — from a scan or a simulation — is worth interrupting someone for.
    if (seen.current === null) {
      seen.current = new Set(probes.map((p) => p.task_id));
      return;
    }
    const fresh = probes.filter((p) => !seen.current!.has(p.task_id));
    if (fresh.length === 0) {
      seen.current = new Set(probes.map((p) => p.task_id));
      return;
    }
    for (const p of fresh) seen.current.add(p.task_id);

    live.current.onBounce();
    if (live.current.veraInFront) {
      live.current.onHighlight(fresh[0].task_id);
      return;
    }
    setCards((prev) => [...fresh.map((p) => ({ id: p.task_id, probe: p })), ...prev].slice(0, MAX_STACK));
  }, [probes, ready]);

  return (
    // Sits under the menu bar on the right. Vera's own window, and the Undo
    // inside it, are left of here and below, so nothing is covered.
    <div className="pointer-events-none fixed right-4 top-11 z-[80] flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {cards.map((c) => (
          <Note
            key={c.id}
            card={c}
            onOpen={() => {
              setCards((prev) => prev.filter((x) => x.id !== c.id));
              live.current.onOpenProbe(c.id);
            }}
            onDismiss={() => setCards((prev) => prev.filter((x) => x.id !== c.id))}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
