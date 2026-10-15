"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PulsePanel } from "./components/PulsePanel";
import { StagePanel } from "./components/StagePanel";
import { AnswerPanel } from "./components/AnswerPanel";
import { VeraOverlay } from "./components/VeraOverlay";
import { VeraGlyph } from "./components/VeraGlyph";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type Finding = {
  finding_id: string;
  kind: string;
  basis: string;
  state: string;
  severity: string;
  detail: string;
  found_at: number;
  target_id?: string;
  target_type?: string;
  target_name?: string;
};

export type HopEvent = {
  hop: number | string;
  action: string;
  description?: string;
  tool?: string;
  cypher?: string;
  results?: any[];
  answer?: string;
  [key: string]: any;
};

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
  const [isAsking, setIsAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [probes, setProbes] = useState<VeraProbe[]>([]);
  const [veraState, setVeraState] = useState<
    "dormant" | "waking" | "speaking" | "settled"
  >("dormant");
  const [showVera, setShowVera] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  // SSE connection for findings stream (The Pulse)
  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/api/findings/stream`);

    eventSource.onmessage = (event) => {
      const finding: Finding = JSON.parse(event.data);
      setFindings((prev) => {
        // Deduplicate
        if (prev.some((f) => f.finding_id === finding.finding_id)) return prev;
        return [finding, ...prev];
      });
    };

    eventSource.onerror = () => {
      // Will reconnect automatically
      console.log("SSE reconnecting...");
    };

    return () => eventSource.close();
  }, []);

  // Load Vera probes
  useEffect(() => {
    fetch(`${API_BASE}/api/vera/probes`)
      .then((r) => r.json())
      .then((data) => {
        setProbes(data.probes || []);
        if (data.probes?.length > 0) {
          setVeraState("waking");
          setTimeout(() => setVeraState("speaking"), 600);
        }
      })
      .catch(() => {});
  }, []);

  // Ask a question — SSE walk
  const handleAsk = useCallback(async () => {
    if (!question.trim() || isAsking) return;

    setIsAsking(true);
    setHops([]);
    setAnswer("");

    try {
      const response = await fetch(`${API_BASE}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
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
            } else {
              setHops((prev) => [...prev, event]);
            }
          }
        }
      }
    } catch (err) {
      setAnswer("Error connecting to SPINE backend.");
    } finally {
      setIsAsking(false);
    }
  }, [question, isAsking]);

  // Trigger reflexes
  const triggerReflexes = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/reflexes/run`, {
        method: "POST",
      });
      const data = await res.json();
      console.log("Reflexes triggered:", data);
    } catch (err) {
      console.error("Failed to trigger reflexes:", err);
    }
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
            onClick={triggerReflexes}
            className="px-3 py-1.5 text-xs rounded-md bg-accent-soft text-accent hover:bg-accent hover:text-white transition-colors"
          >
            Run Reflexes
          </button>
          <VeraGlyph
            state={veraState}
            probeCount={probes.length}
            onClick={() => setShowVera(!showVera)}
          />
        </div>
      </header>

      {/* ── Three-pane control room ── */}
      <div className="flex-1 flex min-h-0">
        {/* Left: The Pulse */}
        <div className="w-72 border-r border-rule flex flex-col bg-slab overflow-hidden">
          <div className="px-3 py-2 border-b border-rule">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              The Pulse
            </h2>
          </div>
          <PulsePanel
            findings={findings}
            onSelect={setSelectedFinding}
            selected={selectedFinding}
          />
        </div>

        {/* Center: The Stage */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-4 py-2 border-b border-rule flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              The Stage
            </h2>
          </div>
          <StagePanel hops={hops} isAsking={isAsking} />

          {/* Question input */}
          <div className="px-4 py-3 border-t border-rule bg-slab">
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                placeholder="Ask SPINE anything... (try: who owns the billing service?)"
                className="flex-1 px-3 py-2 text-sm bg-paper border border-rule rounded-md focus:outline-none focus:border-accent placeholder:text-ink-faint"
              />
              <button
                onClick={handleAsk}
                disabled={isAsking || !question.trim()}
                className="px-4 py-2 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isAsking ? "Walking..." : "Ask"}
              </button>
            </div>
          </div>
        </div>

        {/* Right: The Answer */}
        <div className="w-80 border-l border-rule flex flex-col bg-slab overflow-hidden">
          <div className="px-3 py-2 border-b border-rule">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              The Answer
            </h2>
          </div>
          <AnswerPanel
            answer={answer}
            hops={hops}
            selectedFinding={selectedFinding}
          />
        </div>
      </div>

      {/* Vera overlay */}
      {showVera && (
        <VeraOverlay
          probes={probes}
          onClose={() => setShowVera(false)}
          onRespond={async (probeId, answer) => {
            try {
              await fetch(`${API_BASE}/api/vera/respond`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  probe_id: probeId,
                  answer: answer,
                }),
              });
              setProbes((prev) =>
                prev.filter((p) => p.task_id !== probeId)
              );
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
