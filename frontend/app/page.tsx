"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PulsePanel } from "./components/PulsePanel";
import { StagePanel } from "./components/StagePanel";
import { AnswerPanel } from "./components/AnswerPanel";
import { VeraOverlay } from "./components/VeraOverlay";
import { VeraGlyph } from "./components/VeraGlyph";
import { ThemeToggle } from "./components/ThemeToggle";
import { WelcomeScreen } from "./components/WelcomeScreen";


const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const EXAMPLE_QUESTIONS = [
  "Who owns the billing service?",
  "What happens if the user service goes down?",
  "Show me the deploy process",
  "Is there a bus factor risk on data-pipeline?",
];

export type Finding = {
  finding_id: string;
  kind: string;
  basis: string;
  state: string;
  severity: string;
  detail: string;
  found_at: number;
  /** Set once the problem is fixed; such findings leave the Pulse. */
  resolved_at?: number | null;
  target_id?: string;
  target_type?: string;
  target_name?: string;
};

export type Evidence = {
  claim_id: string;
  text: string;
  confidence: number;
  stale: boolean;
  fact_type?: string;
};

type BackendStatus = {
  graph: "unknown" | "up" | "down";
  llmOk: boolean;
  message: string | null;
};

type GraphStatsResponse = {
  nodes?: Record<string, number>;
  edges?: Record<string, number>;
};

/** A single row inside a hop's `results` — shape varies by tool. */
export type HopResult = string | Record<string, unknown>;

export type HopEvent = {
  hop: number | string;
  action: string;
  description?: string;
  tool?: string;
  cypher?: string;
  results?: HopResult[];
  answer?: string;
  evidence?: Evidence[];
  // broken_path
  ownership_status?: string;
  has_gap?: boolean;
  gap_explanation?: string;
  // classify_intent / resolve_entity
  intent?: string;
  entities?: string[];
  entity?: { id: string; name: string; type: string } | null;
  llm?: boolean;
  [key: string]: unknown;
};

/**
 * Belt-and-braces guard against duplicate probes. The API returns one row
 * per VerifyTask, but a duplicate here would crash React with a repeated
 * key, so the invariant is enforced on this side too.
 */
function dedupeProbes(probes: VeraProbe[] | undefined): VeraProbe[] {
  const seen = new Set<string>();
  return (probes || []).filter((p) => {
    if (!p?.task_id || seen.has(p.task_id)) return false;
    seen.add(p.task_id);
    return true;
  });
}

export type VeraProbe = {
  task_id: string;
  question: string;
  created_at: number;
  claim_id: string;
  finding_id: string;
  finding_kind: string;
  severity: string;
  target_id: string;
  target_name: string;
};

export default function Home() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [hops, setHops] = useState<HopEvent[]>([]);
  const [answer, setAnswer] = useState<string>("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [toast, setToast] = useState<{ title: string; lines: string[] } | null>(
    null
  );
  const [isScanning, setIsScanning] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [isAsking, setIsAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [probes, setProbes] = useState<VeraProbe[]>([]);
  const [veraState, setVeraState] = useState<
    "dormant" | "waking" | "speaking" | "settled"
  >("dormant");
  const [showVera, setShowVera] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [graphStats, setGraphStats] = useState<{ nodes: number; edges: number }>({
    nodes: 0,
    edges: 0,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [backend, setBackend] = useState<BackendStatus>({
    graph: "unknown",
    llmOk: true,
    message: null,
  });
  const [streamEpoch, setStreamEpoch] = useState(0);
  const lastGraphRef = useRef<BackendStatus["graph"]>("unknown");

  const refreshGraphStats = useCallback(() => {
    // /api/graph/stats returns counts keyed by node label / relationship type.
    const sumCounts = (counts: Record<string, number> | undefined) =>
      Object.values(counts ?? {}).reduce((total, n) => total + n, 0);

    return fetch(`${API_BASE}/api/graph/stats`)
      .then((r) => r.json())
      .then((data: GraphStatsResponse) => {
        setGraphStats({
          nodes: sumCounts(data.nodes),
          edges: sumCounts(data.edges),
        });
      })
      .catch(() => {});
  }, []);

  const refreshProbes = useCallback(() => {
    return fetch(`${API_BASE}/api/vera/probes`)
      .then((r) => r.json())
      .then((data) => setProbes(dedupeProbes(data.probes)))
      .catch(() => {});
  }, []);

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

  // Backend health. Polled so the app recovers on its own: if the page
  // loads while the backend is down (or it restarts), everything used to
  // stay at zero forever because each fetch ran once and errors were
  // swallowed. Now a dead graph shows a banner, and the moment /health
  // comes back the stats, probes and findings stream are re-established.
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      let next: BackendStatus;
      try {
        const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
        const body = await res.json();
        next = body?.graph?.ok
          ? {
              graph: "up",
              llmOk: body?.llm?.ok !== false,
              message: body?.llm?.ok === false ? body.llm.error : null,
            }
          : {
              graph: "down",
              llmOk: true,
              message: body?.graph?.message ?? "I couldn't reach the knowledge graph.",
            };
      } catch {
        next = {
          graph: "down",
          llmOk: true,
          message: "I couldn't reach the SPINE server. It may be restarting.",
        };
      } finally {
        clearTimeout(timer);
      }
      if (cancelled) return;

      const wasUp = lastGraphRef.current === "up";
      lastGraphRef.current = next.graph;
      setBackend(next);

      // Recovered (or first successful contact): rebuild everything that
      // was fetched once and may have failed.
      if (next.graph === "up" && !wasUp) {
        setStreamEpoch((n) => n + 1);
        refreshGraphStats();
        refreshProbes();
      }
    };

    check();
    const interval = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshGraphStats, refreshProbes]);

  // SSE connection for findings stream (The Pulse). Re-opened whenever the
  // backend comes back: a browser closes an EventSource for good when the
  // first connection is refused, so it cannot be left to reconnect itself.
  useEffect(() => {
    if (streamEpoch === 0) return;
    const eventSource = new EventSource(`${API_BASE}/api/findings/stream`);

    eventSource.onmessage = (event) => {
      const finding: Finding = JSON.parse(event.data);
      setFindings((prev) => {
        // A finding whose problem has been fixed leaves the Pulse. It is
        // still in the graph as history — it just stops being reported.
        if (finding.state === "resolved") {
          return prev.filter((f) => f.finding_id !== finding.finding_id);
        }
        // Reflexes re-send findings they refresh, so update in place
        // rather than dropping the newer detail on the floor.
        const at = prev.findIndex((f) => f.finding_id === finding.finding_id);
        if (at !== -1) {
          const next = [...prev];
          next[at] = finding;
          return next;
        }
        return [finding, ...prev];
      });
    };

    eventSource.onerror = () => {
      // A dropped (previously open) stream retries by itself. A closed one
      // won't — mark the graph as possibly down so the health poll above
      // reopens the stream once the backend answers again.
      if (eventSource.readyState === EventSource.CLOSED) {
        lastGraphRef.current = "down";
      }
    };

    return () => eventSource.close();
  }, [streamEpoch]);

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

  // Ask a question — SSE walk. Accepts an optional override so example
  // chips can fill the input and trigger the ask in one click, without
  // waiting on the (async) question state to catch up.
  const handleAsk = useCallback(async (overrideQuestion?: string) => {
    const q = (overrideQuestion ?? question).trim();
    if (!q || isAsking) return;

    setQuestion(q);
    setIsAsking(true);
    setHops([]);
    setAnswer("");
    setEvidence([]);

    try {
      const response = await fetch(`${API_BASE}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const event: HopEvent = JSON.parse(line.slice(6));
            if (event.action === "answer") {
              setAnswer(event.answer || "");
              setEvidence(event.evidence || []);
            } else {
              setHops((prev) => [...prev, event]);
            }
          }
        }
      }
    } catch {
      setAnswer("Error connecting to SPINE backend.");
    } finally {
      setIsAsking(false);
    }
  }, [question, isAsking]);

  // Trigger reflexes
  const triggerReflexes = async () => {
    if (isScanning) return;
    setIsScanning(true);

    try {
      const res = await fetch(`${API_BASE}/api/reflexes/run`, {
        method: "POST",
      });
      const data = await res.json();

      const counts: [string, number][] = [
        ["bus-factor", data.bus_factor?.length ?? 0],
        ["orphan", data.orphans?.length ?? 0],
        ["decay", data.decay?.length ?? 0],
        ["contradiction", data.contradictions?.length ?? 0],
      ];
      const found = counts
        .filter(([, n]) => n > 0)
        .map(([label, n]) => `${n} ${label}`)
        .join(", ");

      setToast({
        title: "Scan complete",
        lines: [found ? `Found ${found}` : "No problems found"],
      });
      setTimeout(() => setToast(null), 6000);

      // The scan writes findings — re-read probes and stats rather than guess.
      await Promise.all([refreshProbes(), refreshGraphStats()]);
    } catch (err) {
      console.error("Failed to trigger reflexes:", err);
      setToast({ title: "Scan failed", lines: ["Could not reach the backend."] });
      setTimeout(() => setToast(null), 6000);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {showWelcome && <WelcomeScreen onEnter={() => setShowWelcome(false)} />}
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
            onClick={triggerReflexes}
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
            ? `Nodes: ${graphStats.nodes} | Edges: ${graphStats.edges}`
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
              onClick={() => setToast(null)}
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
            try {
              const res = await fetch(`${API_BASE}/api/vera/respond`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  probe_id: probeId,
                  answer: answer,
                }),
              });
              const data = await res.json();

              if (data.changes?.length) {
                setToast({ title: "Graph updated", lines: data.changes });
                setTimeout(() => setToast(null), 6000);
              }

              // The graph may have changed — re-read it rather than guessing.
              await Promise.all([refreshProbes(), refreshGraphStats()]);

              if (probes.length <= 1) {
                setVeraState("settled");
                setTimeout(() => setVeraState("dormant"), 2000);
              }
            } catch (err) {
              console.error("Failed to respond to probe:", err);
            }
          }}
        />
      )}
    </div>
  );
}
