"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Clock, Square } from "lucide-react";
import type { BackendStatus } from "../lib/types";

export const EXAMPLE_QUESTIONS = [
  "Who owns the billing service?",
  "What happens if the user service goes down?",
  "Show me the deploy process",
  "Is there a bus factor risk on data-pipeline?",
];

/** Why asking is paused right now, in plain words, or null if it isn't. */
export function askBlockedReason(backend: BackendStatus): string | null {
  if (backend.graph === "down") return "SPINE can't reach the graph right now, so asking is paused.";
  if (backend.graph === "unknown") return "Connecting to SPINE…";
  return null;
}

const chip =
  "shrink-0 rounded-full px-3 py-1.5 text-[13px] transition-[transform,background-color] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50";

export function AskBar({
  value,
  onChange,
  onAsk,
  onStop,
  isAsking,
  backend,
  recent,
  showExamples,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Ask this question (the bar has already been filled with it). */
  onAsk: (question: string) => void;
  onStop: () => void;
  isAsking: boolean;
  backend: BackendStatus;
  recent: string[];
  /** The empty answer panel shows the examples itself, so they hide here then. */
  showExamples: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const blocked = askBlockedReason(backend);
  const [shortcut, setShortcut] = useState("Ctrl K");

  // Platform is only known in the browser; read it after mount.
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) {
      const t = setTimeout(() => setShortcut("⌘K"), 0);
      return () => clearTimeout(t);
    }
  }, []);

  // Cmd+K (Mac) / Ctrl+K (Windows) focuses the question input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const send = (q: string) => {
    const question = q.trim();
    if (!question || isAsking || blocked) return;
    onChange(question);
    onAsk(question);
  };

  const recentOnly = recent.filter((q) => !EXAMPLE_QUESTIONS.includes(q));

  return (
    <div className="flex flex-col gap-2">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          send(value);
        }}
        className="glass-strong flex h-14 items-center gap-2 rounded-full pl-5 pr-2"
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onChange("");
            }
          }}
          disabled={!!blocked && !isAsking}
          placeholder={blocked ?? "Ask how your company works…"}
          aria-label="Ask SPINE a question"
          aria-describedby="ask-hint"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-white placeholder:text-white/65 focus:outline-none disabled:cursor-not-allowed"
        />
        <span id="ask-hint" className="hidden shrink-0 text-[13px] text-white/60 lg:inline">
          {isAsking || blocked ? "" : shortcut}
        </span>
        {isAsking ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            className="flex h-10 items-center gap-2 rounded-full bg-white/15 px-4 text-[15px] font-medium text-white hover:bg-white/20 active:scale-[0.97]"
          >
            <Square aria-hidden size={14} className="fill-current" />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim() || !!blocked}
            aria-label="Ask"
            className="grid h-10 w-10 place-items-center rounded-full bg-primary text-white transition-[transform,opacity] active:scale-[0.94] disabled:opacity-40"
          >
            <ArrowUp aria-hidden size={20} />
          </button>
        )}
      </form>

      {(showExamples || recentOnly.length > 0) && (
        <div className="flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {showExamples &&
            EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                disabled={isAsking || !!blocked}
                className={`${chip} glass-thin text-white/90 hover:bg-white/10`}
              >
                {q}
              </button>
            ))}
          {recentOnly.map((q) => (
            <button
              key={`recent-${q}`}
              type="button"
              onClick={() => send(q)}
              disabled={isAsking || !!blocked}
              title="You asked this before"
              className={`${chip} flex items-center gap-1.5 text-white/75 hover:bg-white/10 hover:text-white`}
            >
              <Clock aria-hidden size={13} />
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
