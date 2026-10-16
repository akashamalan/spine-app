/**
 * Shapes of the data SPINE's backend sends. Shared by the hook and every
 * panel, so they live here rather than in a page file.
 */

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

/** One row from GET /api/claims — a live fact, decayed and scored right now. */
export type Claim = {
  id: string;
  text: string;
  fact_type: string;
  base_conf: number;
  asserted_at: number;
  half_life_days: number;
  age_days: number | null;
  confidence: number;
  stale: boolean;
  about: { id: string; type: string; name: string } | null;
  source: string | null;
};

export type Evidence = {
  claim_id: string;
  text: string;
  confidence: number;
  stale: boolean;
  fact_type?: string;
};

export type BackendStatus = {
  graph: "unknown" | "up" | "down";
  llmOk: boolean;
  message: string | null;
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
  /** The one person this is really for, or null when it is for a whole team. */
  asked_of?: string | null;
  /** Everyone who can answer it, owners first. */
  aimed_at?: { id: string; name: string; why: string }[];
};

/** What the graph holds, summed from /api/graph/stats. */
export type GraphStats = {
  /** Every node and edge, bookkeeping included. */
  nodes: number;
  edges: number;
  /** Only what the company knows (people, systems, documents, facts…). */
  knowledgeNodes: number;
  knowledgeEdges: number;
};

export type Toast = { title: string; lines: string[] };

/** A fact that a newer one replaced. Shown as history, never as current. */
export type ReplacedFact = {
  claim_id: string;
  text: string;
  fact_type?: string;
  confidence: number;
  replaced_by?: string | null;
};

export type AskStatus = "idle" | "asking" | "done" | "stopped" | "error";

/** What happened to a 👎. "local" means the backend didn't take it. */
export type FeedbackResult = "sent" | "local";
