"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BackendStatus,
  Evidence,
  Finding,
  GraphStats,
  HopEvent,
  Toast,
  VeraProbe,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const TOAST_MS = 6000;

/** Layer 3 bookkeeping: what SPINE wrote about the graph, not what the company knows. */
const BOOKKEEPING_NODES = new Set(["Finding", "AgentRun", "VerifyTask", "Response"]);
const BOOKKEEPING_EDGES = new Set(["FLAGS", "RAISED_BY", "ANSWERED", "RESOLVED_BY"]);

type ScanResponse = Partial<
  Record<"bus_factor" | "orphans" | "decay" | "contradictions", { finding_id?: string }[]>
>;

type GraphStatsResponse = {
  nodes?: Record<string, number>;
  edges?: Record<string, number>;
};

/**
 * Belt-and-braces guard against duplicate probes. The API returns one row
 * per VerifyTask, but a duplicate here would crash React with a repeated
 * key, so the invariant is enforced on this side too.
 */
export function dedupeProbes(probes: VeraProbe[] | undefined): VeraProbe[] {
  const seen = new Set<string>();
  return (probes || []).filter((p) => {
    if (!p?.task_id || seen.has(p.task_id)) return false;
    seen.add(p.task_id);
    return true;
  });
}

export type Spine = {
  findings: Finding[];
  hops: HopEvent[];
  answer: string;
  evidence: Evidence[];
  probes: VeraProbe[];
  selectedFinding: Finding | null;
  setSelectedFinding: (finding: Finding | null) => void;
  isAsking: boolean;
  isScanning: boolean;
  backend: BackendStatus;
  stats: GraphStats;
  /** Walk the graph for an answer. Ignored while another ask is running. */
  ask: (question: string) => Promise<void>;
  /** Abort the running ask. Whatever already arrived stays on screen. */
  stopAsking: () => void;
  scan: () => Promise<void>;
  /** Send a human's own words to Vera. Resolves true once the backend took it. */
  respond: (probeId: string, text: string) => Promise<boolean>;
  toast: Toast | null;
  dismissToast: () => void;
};

/**
 * All of SPINE's live state and every call to the backend, in one place,
 * so layouts only render.
 */
export function useSpine(): Spine {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [hops, setHops] = useState<HopEvent[]>([]);
  const [answer, setAnswer] = useState<string>("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [probes, setProbes] = useState<VeraProbe[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [stats, setStats] = useState<GraphStats>({
    nodes: 0,
    edges: 0,
    knowledgeNodes: 0,
    knowledgeEdges: 0,
  });
  const [backend, setBackend] = useState<BackendStatus>({
    graph: "unknown",
    llmOk: true,
    message: null,
  });
  const [streamEpoch, setStreamEpoch] = useState(0);
  const lastGraphRef = useRef<BackendStatus["graph"]>("unknown");
  const findingsRef = useRef<Finding[]>([]);
  useEffect(() => {
    findingsRef.current = findings;
  }, [findings]);

  // Refs mirror the busy flags so the guards never read a stale closure.
  const askingRef = useRef(false);
  const scanningRef = useRef(false);
  const askAbortRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((next: Toast) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(next);
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  const refreshGraphStats = useCallback(() => {
    // /api/graph/stats returns counts keyed by node label / relationship type.
    const sum = (counts: Record<string, number> | undefined, skip?: Set<string>) =>
      Object.entries(counts ?? {}).reduce(
        (total, [key, n]) => (skip?.has(key) ? total : total + n),
        0
      );

    return fetch(`${API_BASE}/api/graph/stats`)
      .then((r) => r.json())
      .then((data: GraphStatsResponse) => {
        setStats({
          nodes: sum(data.nodes),
          edges: sum(data.edges),
          knowledgeNodes: sum(data.nodes, BOOKKEEPING_NODES),
          knowledgeEdges: sum(data.edges, BOOKKEEPING_EDGES),
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

  // Toast timer and any running ask die with the component.
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      askAbortRef.current?.abort();
    };
  }, []);

  // Ask a question — SSE walk.
  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || askingRef.current) return;

    const ctrl = new AbortController();
    askAbortRef.current = ctrl;
    askingRef.current = true;
    setIsAsking(true);
    setHops([]);
    setAnswer("");
    setEvidence([]);

    try {
      const response = await fetch(`${API_BASE}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: ctrl.signal,
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
      // Stopped on purpose: not an error, keep what arrived.
      if (!ctrl.signal.aborted) setAnswer("Error connecting to SPINE backend.");
    } finally {
      if (askAbortRef.current === ctrl) askAbortRef.current = null;
      askingRef.current = false;
      setIsAsking(false);
    }
  }, []);

  const stopAsking = useCallback(() => {
    askAbortRef.current?.abort();
  }, []);

  const scan = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setIsScanning(true);

    try {
      const res = await fetch(`${API_BASE}/api/reflexes/run`, {
        method: "POST",
      });
      const data: ScanResponse = await res.json();

      // "New" means a problem that wasn't on screen before this scan; the
      // reflexes re-report problems they already know about.
      const known = new Set(findingsRef.current.map((f) => f.finding_id));
      const reported = new Set(
        [data.bus_factor, data.orphans, data.decay, data.contradictions]
          .flatMap((list) => list ?? [])
          .map((f) => f.finding_id)
          .filter((id): id is string => !!id)
      );
      const fresh = [...reported].filter((id) => !known.has(id)).length;

      showToast({
        title: "Checked everything.",
        lines: [
          fresh === 0
            ? "Nothing new to look at."
            : `${fresh} new ${fresh === 1 ? "thing" : "things"} to look at.`,
        ],
      });

      // The scan writes findings — re-read probes and stats rather than guess.
      await Promise.all([refreshProbes(), refreshGraphStats()]);
    } catch (err) {
      console.error("Failed to trigger reflexes:", err);
      showToast({ title: "Couldn't run the check.", lines: ["SPINE's server didn't answer. Try again in a moment."] });
    } finally {
      scanningRef.current = false;
      setIsScanning(false);
    }
  }, [refreshGraphStats, refreshProbes, showToast]);

  const respond = useCallback(
    async (probeId: string, text: string) => {
      try {
        const res = await fetch(`${API_BASE}/api/vera/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            probe_id: probeId,
            answer: text,
          }),
        });
        const data = await res.json();

        if (data.changes?.length) {
          showToast({ title: "Graph updated", lines: data.changes });
        }

        // The graph may have changed — re-read it rather than guessing.
        await Promise.all([refreshProbes(), refreshGraphStats()]);
        return true;
      } catch (err) {
        console.error("Failed to respond to probe:", err);
        return false;
      }
    },
    [refreshGraphStats, refreshProbes, showToast]
  );

  return {
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
    ask,
    stopAsking,
    scan,
    respond,
    toast,
    dismissToast,
  };
}
