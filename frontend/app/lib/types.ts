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
