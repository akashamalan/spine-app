"use client";

import { useEffect, useRef } from "react";

const STEPS = [
  "This is your company. Every dot on the map is a person, a service or a document, and the lines show how they depend on each other.",
  "Ask anything and watch SPINE walk the graph to find the answer, one step at a time.",
  "Colours show how fresh a fact is: green is up to date, amber is getting old, red is probably outdated.",
  "When something looks wrong, Vera asks the right person. Only a person's answer ever changes what SPINE believes.",
  "Right-click anything: people, services, documents, answers, the desktop. Hold Shift to get your browser's own menu.",
];

/** Real questions about the seeded company, so each one has an answer. */
const SAMPLES = [
  "Who owns the billing service?",
  "What happens if the user service goes down?",
  "Show me the deploy process",
  "Is there a bus factor risk on data-pipeline?",
  "What does the audit log service do?",
  "How do we roll back a deploy?",
];

export function GettingStarted({ onAsk, onSkip }: { onAsk: (q: string) => void; onSkip: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  // Focus lands inside, so Esc works straight away. It closes this window
  // only; there is no spotlight and nothing traps the keyboard.
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={root}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onSkip();
        }
      }}
      className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6 pt-2 outline-none"
    >
      <div>
        <h2 className="text-[20px] font-semibold tracking-tight">Welcome to SPINE</h2>
        <p className="mt-1 text-[15px] text-white/75">A company brain that asks you, not just the other way round.</p>
      </div>

      <ol className="flex flex-col gap-3">
        {STEPS.map((s, i) => (
          <li key={s} className="flex gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/15 text-[13px] font-semibold"
            >
              {i + 1}
            </span>
            <p className="text-[15px] leading-snug text-white/90">{s}</p>
          </li>
        ))}
      </ol>

      <div>
        <h3 className="pb-2 text-[13px] font-medium text-white/70">Try one</h3>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SAMPLES.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => onAsk(q)}
                className="glass-thin w-full rounded-2xl px-3.5 py-2.5 text-left text-[15px] leading-snug transition-colors hover:bg-white/[0.14] active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-white"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto flex justify-end">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full bg-white/12 px-4 py-2 text-[13px] font-medium hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
