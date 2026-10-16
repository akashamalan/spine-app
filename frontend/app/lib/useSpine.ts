"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AskStatus,
  BackendStatus,
  Claim,
  Evidence,
  FeedbackResult,
  Finding,
  GraphStats,
  HopEvent,
  ReplacedFact,
  Toast,
  VeraProbe,
} from "./types";
import { isSubgraphResponse, type Subgraph } from "../components/graph/model";
import { apiFetch, getIdentity, useIdentity, type Identity } from "./identity";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const TOAST_MS = 6000;

/** Layer 3 bookkeeping: what SPINE wrote about the graph, not what the company knows. */
const BOOKKEEPING_NODES = new Set(["Finding", "AgentRun", "VerifyTask", "Response"]);
const BOOKKEEPING_EDGES = new Set(["FLAGS", "RAISED_BY", "ANSWERED", "RESOLVED_BY"]);

type ScanResponse = Partial<
  Record<"bus_factor" | "orphans" | "decay" | "contradictions", { finding_id?: string }[]>
>;

/** The ask stream's last event. `error` is set when the walk failed mid-way. */
type FinalEvent = HopEvent & {
  replaced?: ReplacedFact[];
  error?: { message?: string } | null;
};

const FEEDBACK_KEY = "spine-feedback";

/** Keep a 👎 the backend couldn't take, so it isn't lost. */
function storeFeedbackLocally(entry: Record<string, unknown>) {
  try {
    const prev = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "[]");
    const list = Array.isArray(prev) ? prev : [];
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify([...list, entry].slice(-50)));
  } catch {
    // Storage blocked or full: the thanks still shows, nothing else to do.
  }
}

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

/** What the last demo scenario did, kept so the Simulation window can show it. */
const keyOf = (id: Identity | null) => (id ? `${id.personId}:${id.role}` : "");

export type SimRun = {
  scenario: string;
  /** Plain sentences about what changed in the company. */
  changed: string[];
  /** Findings this run created (not ones it merely refreshed). */
  newIds: string[];
  at: number;
};

/** A finding arriving from the stream or from a simulation: resolved ones
 * leave the list, ones already known are updated in place, new ones go first. */
export function mergeFinding(prev: Finding[], finding: Finding): Finding[] {
  // A finding whose problem has been fixed leaves the Pulse. It is still in
  // the graph as history — it just stops being reported.
  if (finding.state === "resolved") return prev.filter((f) => f.finding_id !== finding.finding_id);
  // Reflexes re-send findings they refresh, so update in place rather than
  // dropping the newer detail on the floor.
  const at = prev.findIndex((f) => f.finding_id === finding.finding_id);
  if (at !== -1) {
    const next = [...prev];
    next[at] = finding;
    return next;
  }
  return [finding, ...prev];
}

export type Spine = {
  findings: Finding[];
  hops: HopEvent[];
  answer: string;
  evidence: Evidence[];
  /** Older facts the answer's subject used to have, newest replacement noted. */
  replaced: ReplacedFact[];
  /** When each evidence fact was written (epoch seconds), from /api/claims. */
  factDates: Record<string, number>;
  /** The question behind the current answer, for Retry and feedback. */
  lastQuestion: string;
  askStatus: AskStatus;
  /** A plain sentence when the ask failed. */
  askError: string | null;
  probes: VeraProbe[];
  selectedFinding: Finding | null;
  setSelectedFinding: (finding: Finding | null) => void;
  isAsking: boolean;
  isScanning: boolean;
  backend: BackendStatus;
  stats: GraphStats;
  /** The whole company, for the idle graph. Null until it has loaded. */
  companyMap: Subgraph | null;
  /** True when the company map could not be loaded. */
  companyMapFailed: boolean;
  /** Every live claim with its decay inputs and confidence computed now. */
  claims: Claim[];
  /** Findings resolved in the last 7 days. Null until loaded (not yet known,
   *  distinct from a real zero). */
  resolvedThisWeek: number | null;
  /** True once the current person's first list of questions has arrived. */
  probesReady: boolean;
  /** The most recent demo scenario, if one has run in this visit. */
  lastSim: SimRun | null;
  /** The scenario currently running, or null. */
  simRunning: string | null;
  /** Run a demo scenario (administrators only; the server enforces it). */
  simulate: (scenario: string, body?: Record<string, unknown>) => Promise<SimRun | null>;
  /** Walk the graph for an answer. Ignored while another ask is running. */
  ask: (question: string) => Promise<void>;
  /** Abort the running ask. Whatever already arrived stays on screen. */
  stopAsking: () => void;
  scan: () => Promise<void>;
  /** Admin: have Vera check these facts with a person. Resolves true once asked. */
  veraAsk: (claimIds: string[], note?: string) => Promise<boolean>;
  /** 👎 on the current answer: asks Vera to re-check its facts. */
  feedback: (reason?: string) => Promise<FeedbackResult>;
  notify: (toast: Toast) => void;
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
  const [replaced, setReplaced] = useState<ReplacedFact[]>([]);
  const [factDates, setFactDates] = useState<Record<string, number>>({});
  const [lastQuestion, setLastQuestion] = useState("");
  const [askStatus, setAskStatus] = useState<AskStatus>("idle");
  const [askError, setAskError] = useState<string | null>(null);
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
  const [companyMap, setCompanyMap] = useState<Subgraph | null>(null);
  const [companyMapFailed, setCompanyMapFailed] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [resolvedThisWeek, setResolvedThisWeek] = useState<number | null>(null);
  const [streamEpoch, setStreamEpoch] = useState(0);
  // Whose list of questions has been read last. The first list for a person is
  // never news, so "ready" means "read for the person who is picked now".
  const [probesReadyFor, setProbesReadyFor] = useState<string | null>(null);
  const [lastSim, setLastSim] = useState<SimRun | null>(null);
  const [simRunning, setSimRunning] = useState<string | null>(null);
  const identity = useIdentity();
  const identityKey = keyOf(identity);
  const probesReady = probesReadyFor === identityKey;
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

    return apiFetch(`${API_BASE}/api/graph/stats`)
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
    // The answer belongs to whoever was picked when it was asked for.
    const asked = keyOf(getIdentity());
    return apiFetch(`${API_BASE}/api/vera/probes`)
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data?.probes)) return;
        setProbes(dedupeProbes(data.probes));
        setProbesReadyFor(asked);
      })
      .catch(() => {});
  }, []);

  // A finding arriving is the signal that a question may have been raised
  // with it. Debounced: a scan sends a burst of findings, one read is enough.
  const probeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleProbeRefresh = useCallback(() => {
    if (probeTimer.current) clearTimeout(probeTimer.current);
    probeTimer.current = setTimeout(() => {
      refreshProbes();
    }, 600);
  }, [refreshProbes]);

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
      setFindings((prev) => mergeFinding(prev, finding));
      scheduleProbeRefresh();
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
  }, [streamEpoch, scheduleProbeRefresh]);

  // Toast timer and any running ask die with the component.
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      askAbortRef.current?.abort();
    };
  }, []);

  // The idle company map, loaded once the graph is reachable. It lives here,
  // not in the graph panel, so closing and reopening the panel never refetches.
  const graphUp = backend.graph === "up";
  const loadCompanyMap = useCallback(() => {
    return apiFetch(`${API_BASE}/api/graph/overview`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`overview ${r.status}`))))
      .then((data: unknown) => {
        if (isSubgraphResponse(data)) {
          setCompanyMap(data);
          setCompanyMapFailed(false);
        } else setCompanyMapFailed(true);
      })
      .catch(() => setCompanyMapFailed(true));
  }, []);
  useEffect(() => {
    if (graphUp) loadCompanyMap();
  }, [graphUp, loadCompanyMap]);

  // Switching person changes whose questions are shown, so read them again.
  useEffect(() => {
    if (graphUp) refreshProbes();
  }, [identityKey, graphUp, refreshProbes]);

  // Evidence carries no dates; /api/claims does, plus everything the stats
  // strip needs (base_conf, half_life, live confidence). One endpoint, two
  // consumers — loaded fresh whenever an answer arrives, and once up front
  // so the strip has real numbers before anyone asks a question.
  const loadFactDates = useCallback(() => {
    apiFetch(`${API_BASE}/api/claims`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { claims?: Claim[] } | null) => {
        const list = data?.claims ?? [];
        const dates: Record<string, number> = {};
        for (const c of list) if (c.asserted_at) dates[c.id] = c.asserted_at;
        setFactDates(dates);
        setClaims(list);
      })
      .catch(() => {});
  }, []);

  // Findings resolved in the last 7 days: not something the live findings
  // stream carries (it only reports OPEN problems), so this is its own
  // one-shot read against the same endpoint with include_resolved=true.
  const refreshResolvedCount = useCallback(() => {
    return apiFetch(`${API_BASE}/api/findings?include_resolved=true`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { findings?: { resolved_at?: number | null }[] } | null) => {
        if (!data) return;
        const cutoff = Date.now() / 1000 - 7 * 86400;
        const count = (data.findings ?? []).filter(
          (f) => typeof f.resolved_at === "number" && f.resolved_at >= cutoff
        ).length;
        setResolvedThisWeek(count);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!graphUp) return;
    loadFactDates();
    refreshResolvedCount();
    // Only on the up-transition: loadFactDates already re-runs after every
    // answer, and re-running it here too on every render would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphUp]);

  // Ask a question — SSE walk.
  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || askingRef.current) return;

    const ctrl = new AbortController();
    askAbortRef.current = ctrl;
    askingRef.current = true;
    setIsAsking(true);
    setAskStatus("asking");
    setAskError(null);
    setLastQuestion(q);
    setHops([]);
    setAnswer("");
    setEvidence([]);
    setReplaced([]);
    let outcome: AskStatus = "done";

    try {
      const response = await apiFetch(`${API_BASE}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: ctrl.signal,
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const event: FinalEvent = JSON.parse(line.slice(6));
            if (event.action === "answer") {
              if (event.error) {
                // The walk failed part-way; the backend's message is plain.
                outcome = "error";
                setAskError(event.error.message || event.answer || "Something went wrong while I was looking.");
              } else {
                setAnswer(event.answer || "");
                setEvidence(event.evidence || []);
                setReplaced(event.replaced || []);
                loadFactDates();
              }
            } else {
              setHops((prev) => [...prev, event]);
            }
          }
        }
      }
    } catch {
      if (ctrl.signal.aborted) {
        // Stopped on purpose: not an error, keep what arrived.
        outcome = "stopped";
      } else {
        outcome = "error";
        setAskError("I couldn't reach SPINE's server, so I don't have an answer yet.");
      }
    } finally {
      if (askAbortRef.current === ctrl) askAbortRef.current = null;
      askingRef.current = false;
      setIsAsking(false);
      setAskStatus(outcome);
    }
  }, [loadFactDates]);

  /** Run a demo scenario (admin only). The server changes the graph, runs the
   * reflexes and answers with what it found; those findings land in the same
   * list the live stream feeds, so the screen updates before the stream does. */
  const simulate = useCallback(
    async (scenario: string, body?: Record<string, unknown>): Promise<SimRun | null> => {
      setSimRunning(scenario);
      try {
        const res = await apiFetch(`${API_BASE}/api/simulate/${scenario}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          showToast({
            title: res.status === 403 ? "Only administrators can do that." : "That didn't run.",
            lines: [typeof data?.message === "string" ? data.message : "SPINE's server didn't accept it."],
          });
          return null;
        }
        const found: Finding[] = (data.findings ?? []).map((f: Finding & { is_new?: boolean }) => {
          const copy = { ...f };
          delete copy.is_new; // a note about this run, not part of a finding
          return copy;
        });
        const run: SimRun = {
          scenario,
          changed: data.changed ?? [],
          newIds: (data.findings ?? [])
            .filter((f: { is_new?: boolean }) => f.is_new)
            .map((f: { finding_id: string }) => f.finding_id),
          at: Date.now(),
        };
        setLastSim(run);
        // A reset starts the company over, so what was on screen is replaced.
        setFindings((prev) =>
          scenario === "reset" ? found : found.reduce((acc, f) => mergeFinding(acc, f), prev)
        );
        await Promise.all([
          refreshProbes(),
          refreshGraphStats(),
          loadFactDates(),
          refreshResolvedCount(),
          loadCompanyMap(),
        ]);
        return run;
      } catch {
        showToast({ title: "That didn't run.", lines: ["SPINE's server didn't answer. Try again in a moment."] });
        return null;
      } finally {
        setSimRunning(null);
      }
    },
    [loadCompanyMap, loadFactDates, refreshGraphStats, refreshProbes, refreshResolvedCount, showToast]
  );

  const veraAsk = useCallback(
    async (claimIds: string[], note?: string): Promise<boolean> => {
      if (claimIds.length === 0) return false;
      try {
        const res = await apiFetch(`${API_BASE}/api/vera/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claim_ids: claimIds, note, requested_by: getIdentity()?.name }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          showToast({
            title: res.status === 403 ? "Only administrators can do that." : "Vera couldn't take that.",
            lines: [typeof data?.message === "string" ? data.message : "SPINE's server didn't accept it."],
          });
          return false;
        }
        const results: { status: string }[] = data?.results ?? [];
        const asked = results.filter((r) => r.status === "asked").length;
        showToast({
          title: asked > 0 ? "Vera is on it." : "Already being checked.",
          lines: [
            asked > 0
              ? `${asked} ${asked === 1 ? "question was" : "questions were"} sent to the right people.`
              : "Those facts already have an open question.",
          ],
        });
        await refreshProbes();
        return true;
      } catch {
        showToast({ title: "Vera couldn't take that.", lines: ["SPINE's server didn't answer. Try again in a moment."] });
        return false;
      }
    },
    [refreshProbes, showToast]
  );

  const stopAsking = useCallback(() => {
    askAbortRef.current?.abort();
  }, []);

  const scan = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setIsScanning(true);

    try {
      const res = await apiFetch(`${API_BASE}/api/reflexes/run`, {
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
      await Promise.all([refreshProbes(), refreshGraphStats(), loadFactDates(), refreshResolvedCount()]);
    } catch (err) {
      console.error("Failed to trigger reflexes:", err);
      showToast({ title: "Couldn't run the check.", lines: ["SPINE's server didn't answer. Try again in a moment."] });
    } finally {
      scanningRef.current = false;
      setIsScanning(false);
    }
  }, [loadFactDates, refreshGraphStats, refreshProbes, refreshResolvedCount, showToast]);

  const respond = useCallback(
    async (probeId: string, text: string) => {
      try {
        const res = await apiFetch(`${API_BASE}/api/vera/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            probe_id: probeId,
            answer: text,
            answered_by: getIdentity()?.name,
          }),
        });
        const data = await res.json().catch(() => null);

        // A rejected answer (404 probe gone, 400 already answered, 500 …) must
        // not look like success: say why, keep the question open, report false.
        if (!res.ok) {
          const detail = typeof data?.detail === "string" ? data.detail : null;
          showToast({
            title: "Vera didn't take that answer.",
            lines: [detail ?? "SPINE's server didn't accept it. The question is still open — try again."],
          });
          await refreshProbes();
          return false;
        }

        if (data?.verdict === "already_replaced") {
          showToast({
            title: "That fact was already replaced.",
            lines: ["Nothing was changed. Your earlier correction still stands."],
          });
        } else if (data?.changes?.length) {
          showToast({ title: "Graph updated", lines: data.changes });
        }

        // The graph may have changed — re-read it rather than guessing.
        await Promise.all([refreshProbes(), refreshGraphStats(), loadFactDates(), refreshResolvedCount()]);
        return true;
      } catch (err) {
        console.error("Failed to respond to probe:", err);
        showToast({
          title: "Couldn't reach SPINE.",
          lines: ["Your answer wasn't saved. The question is still open."],
        });
        return false;
      }
    },
    [loadFactDates, refreshGraphStats, refreshProbes, refreshResolvedCount, showToast]
  );

  const feedback = useCallback(
    async (reason?: string): Promise<FeedbackResult> => {
      const entry = {
        question: lastQuestion,
        answer,
        claim_ids: evidence.map((e) => e.claim_id),
        ...(reason ? { reason } : {}),
      };
      try {
        const res = await apiFetch(`${API_BASE}/api/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        });
        if (!res.ok) throw new Error(`feedback ${res.status}`);
        showToast({
          title: "Thanks — noted.",
          lines: ["Vera will check these facts with a person."],
        });
        // The doubt raised a question for Vera.
        refreshProbes();
        return "sent";
      } catch {
        storeFeedbackLocally({ ...entry, at: Date.now() });
        showToast({ title: "Thanks — noted.", lines: [] });
        return "local";
      }
    },
    [answer, evidence, lastQuestion, refreshProbes, showToast]
  );

  return {
    findings,
    hops,
    answer,
    evidence,
    replaced,
    factDates,
    lastQuestion,
    askStatus,
    askError,
    probes,
    selectedFinding,
    setSelectedFinding,
    isAsking,
    isScanning,
    backend,
    stats,
    companyMap,
    companyMapFailed,
    claims,
    resolvedThisWeek,
    probesReady,
    lastSim,
    simRunning,
    simulate,
    veraAsk,
    ask,
    stopAsking,
    scan,
    feedback,
    notify: showToast,
    respond,
    toast,
    dismissToast,
  };
}
