"use client";

import { useEffect, useRef, useState } from "react";
import { PulsePanel } from "./PulsePanel";
import { StagePanel } from "./StagePanel";
import { AnswerPanel } from "./AnswerPanel";
import { VeraOverlay } from "./VeraOverlay";
import { VeraGlyph } from "./VeraGlyph";
import { ThemeToggle } from "./ThemeToggle";
import { useSpine } from "../lib/useSpine";

const EXAMPLE_QUESTIONS = [
  "Who owns the billing service?",
  "What happens if the user service goes down?",
  "Show me the deploy process",
  "Is there a bus factor risk on data-pipeline?",
];

export function Home() {
  const spine = useSpine();
  const {
    findings,
    hops,
    answer,
    evidence,
    probes,
    selectedFinding,
    setSelectedFinding,
    isAsking,
    isScanning,
    backend,
    stats,
    toast,
    dismissToast,
  } = spine;

  const [question, setQuestion] = useState("");
  const [veraState, setVeraState] = useState<
    "dormant" | "waking" | "speaking" | "settled"
  >("dormant");
  const [showVera, setShowVera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global keyboard shortcut: Cmd+K (Mac) / Ctrl+K (Windows) focuses the question input.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Wake Vera once there are open questions.
  const hasProbes = probes.length > 0;
  useEffect(() => {
    if (!hasProbes) return;
    const wake = setTimeout(() => setVeraState("waking"), 0);
    const speak = setTimeout(() => setVeraState("speaking"), 600);
    return () => {
      clearTimeout(wake);
      clearTimeout(speak);
    };
  }, [hasProbes]);

  // Accepts an optional override so example chips can fill the input and
  // trigger the ask in one click, without waiting on the (async) question
  // state to catch up.
  const handleAsk = (overrideQuestion?: string) => {
    const q = (overrideQuestion ?? question).trim();
    if (!q || isAsking) return;
    setQuestion(q);
    spine.ask(q);
  };

  return (
    <div className="h-full flex flex-col">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-rule bg-slab shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight font-[family-name:var(--font-geist-sans)]">
            SPINE
          </h1>
          <span className="text-xs text-ink-faint">
            Answer Engine + Reflex Layer + Vera
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={spine.scan}
            disabled={isScanning}
            className="px-3 py-1.5 text-xs rounded-md bg-accent-soft text-primary hover:bg-primary hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent-soft disabled:hover:text-primary"
          >
            {isScanning ? "Scanning…" : "Run Reflexes"}
          </button>
          <VeraGlyph
            state={veraState}
            probeCount={probes.length}
            onClick={() => setShowVera(!showVera)}
          />
          <ThemeToggle />
        </div>
      </header>

      {/* ── Backend status banner ── */}
      {backend.graph === "down" && (
        <div
          role="alert"
          className="shrink-0 px-4 py-2 text-xs bg-signal-soft text-signal border-b border-rule"
        >
          <span className="font-semibold">I couldn&apos;t reach the knowledge graph.</span>{" "}
          {backend.message} Retrying every 10 seconds — this clears on its own
          once the backend is back.
        </div>
      )}
      {backend.graph === "up" && !backend.llmOk && (
        <div
          role="status"
          className="shrink-0 px-4 py-2 text-xs bg-warn-soft text-warn border-b border-rule"
        >
          <span className="font-semibold">Answers are using a simple fallback.</span>{" "}
          {backend.message}
        </div>
      )}

      {/* ── Three-pane control room ── */}
      <div className="flex-1 flex min-h-0">
        {/* Left: The Pulse */}
        <div className="w-72 border-r border-rule flex flex-col bg-slab overflow-hidden">
          <div className="px-3 py-2 border-b border-rule">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              The Pulse
            </h2>
            <p className="text-[10px] text-ink-faint mt-0.5">
              Problems SPINE found on its own
            </p>
          </div>
          <PulsePanel
            findings={findings}
            onSelect={setSelectedFinding}
            selected={selectedFinding}
          />
        </div>

        {/* Center: The Stage */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-2 border-b border-rule">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              The Stage
            </h2>
            <p className="text-[10px] text-ink-faint mt-0.5">
              How SPINE searched for your answer
            </p>
          </div>
          <StagePanel hops={hops} isAsking={isAsking} />

          {/* Question input */}
          <div className="px-4 py-3 border-t border-rule bg-slab">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                placeholder="Ask SPINE anything... ⌘K"
                className="flex-1 px-3 py-2 text-sm bg-paper border border-rule rounded-md focus:outline-none focus:border-primary placeholder:text-ink-faint"
              />
              <button
                onClick={() => handleAsk()}
                disabled={isAsking || !question.trim()}
                className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isAsking ? "Walking..." : "Ask"}
              </button>
            </div>

            {/* Example question chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleAsk(q)}
                  disabled={isAsking}
                  className="px-2.5 py-1 text-[11px] rounded-full bg-sunk text-ink-soft hover:bg-rule transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: The Answer */}
        <div className="w-80 border-l border-rule flex flex-col bg-slab overflow-hidden">
          <div className="px-3 py-2 border-b border-rule">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              The Answer
            </h2>
            <p className="text-[10px] text-ink-faint mt-0.5">
              What SPINE knows — and how sure it is
            </p>
          </div>
          <AnswerPanel
            answer={answer}
            evidence={evidence}
            hops={hops}
            selectedFinding={selectedFinding}
          />
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="h-8 shrink-0 bg-sunk border-t border-rule flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-ink-faint">
            Findings: {findings.length}
          </span>
          <span className="text-[10px] text-ink-faint">
            Confidence Floor: 60%
          </span>
          <span className="text-[10px] text-ink-faint">
            Vera Probes: {probes.length}
          </span>
        </div>
        <span className="text-[10px] text-ink-faint">
          {backend.graph === "up"
            ? `Nodes: ${stats.nodes} | Edges: ${stats.edges}`
            : backend.graph === "down"
              ? "Graph unreachable"
              : "Connecting…"}
        </span>
      </div>

      {/* Change toast — what Vera actually wrote to the graph */}
      {toast && (
        <div className="fixed bottom-14 right-4 z-[60] max-w-sm rounded-lg border border-good bg-good-soft px-3 py-2.5 shadow-lg animate-hop">
          <div className="flex items-start gap-2">
            <span className="text-sm leading-none mt-0.5">✓</span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-good mb-1">
                {toast.title}
              </p>
              <ul className="space-y-0.5">
                {toast.lines.map((c, i) => (
                  <li key={i} className="text-[11px] text-ink-soft leading-snug">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={dismissToast}
              className="ml-auto shrink-0 text-ink-faint hover:text-ink text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Vera overlay */}
      {showVera && (
        <VeraOverlay
          probes={probes}
          onClose={() => setShowVera(false)}
          onRespond={async (probeId, answer) => {
            const ok = await spine.respond(probeId, answer);
            if (ok && probes.length <= 1) {
              setVeraState("settled");
              setTimeout(() => setVeraState("dormant"), 2000);
            }
          }}
        />
      )}
    </div>
  );
}
