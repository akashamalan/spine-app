"use client";

import { useEffect, useRef } from "react";
import type { VeraProbe } from "../lib/types";
import { displayName } from "../lib/labels";

/** The list inside the Vera window. On the desktop a brand-new question can be
 * scrolled to and lit up for a moment; on a phone it is just the list. */
export function VeraList({
  probes,
  onAnswer,
  highlight = null,
}: {
  probes: VeraProbe[];
  onAnswer: () => void;
  /** task_id of a question that has just arrived. */
  highlight?: string | null;
}) {
  const rowRefs = useRef(new Map<string, HTMLLIElement | null>());

  useEffect(() => {
    if (!highlight) return;
    rowRefs.current.get(highlight)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlight]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="shrink-0 text-[15px] text-white/90">
        {probes.length === 0
          ? "Nothing to confirm right now."
          : `${probes.length} ${probes.length === 1 ? "question needs" : "questions need"} a person.`}
      </p>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {probes.map((p) => (
          <li
            key={p.task_id}
            ref={(el) => {
              rowRefs.current.set(p.task_id, el);
            }}
            className={`rounded-lg px-2 py-1.5 text-[13px] transition-colors duration-500 ${
              highlight === p.task_id ? "bg-white/20 text-white" : "text-white/75"
            }`}
          >
            About {displayName(p.target_name, "something in the graph")}
          </li>
        ))}
      </ul>
      {probes.length > 0 && (
        <button
          type="button"
          onClick={onAnswer}
          className="shrink-0 self-start rounded-full bg-white/10 px-4 py-2 text-[13px] font-medium hover:bg-white/15 active:scale-[0.97]"
        >
          Answer Vera&apos;s questions
        </button>
      )}
    </div>
  );
}
