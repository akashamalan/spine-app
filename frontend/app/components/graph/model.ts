/**
 * The graph panel's data model: the `subgraph` each /api/ask hop carries,
 * merged hop by hop into one picture, plus the idle company map.
 */
import type { HopEvent } from "../../lib/types";

export type SGNodeType = "person" | "service" | "document" | "team" | "claim" | "finding";

export type SGNode = {
  id: string;
  type: SGNodeType;
  label: string;
  sublabel?: string | null;
  confidence?: number | null;
  stale?: boolean;
  left?: boolean;
  left_at?: string | null;
  superseded?: boolean;
  asserted_at?: string | null;
  is_focus?: boolean;
  team_id?: string | null;
  team?: string | null;
  /** Open finding kinds on this node. */
  flags?: string[] | null;
  /** Blast radius ring. */
  depth?: number | null;
};

export type SGEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string | null;
  confidence?: number | null;
  stale?: boolean;
  superseded?: boolean;
  on_path?: boolean;
  claim_id?: string;
};

export type Subgraph = { nodes: SGNode[]; edges: SGEdge[] };

/** A merged node remembers which step first showed it (for order and pop-in). */
export type MNode = SGNode & { step: number; badges: string[] };
export type MEdge = SGEdge & { step: number };

export type Merged = {
  nodes: MNode[];
  edges: MEdge[];
  focusId: string | null;
  /** Step of the most recent hop that drew something. */
  lastStep: number;
};

export type Layout = "ego" | "blast" | "path" | "map";

function isSubgraph(v: unknown): v is Subgraph {
  return (
    !!v &&
    typeof v === "object" &&
    Array.isArray((v as Subgraph).nodes) &&
    Array.isArray((v as Subgraph).edges)
  );
}

/** Which layout fits the question, from the backend's own intent. */
export function layoutForHops(hops: HopEvent[]): Layout {
  const intent = hops.find((h) => h.tool === "classify_intent" && h.intent)?.intent;
  if (intent === "ownership" || intent === "who_knows") return "ego";
  if (intent === "impact" || intent === "blast_radius") return "blast";
  return "path";
}

/**
 * Fold every hop's subgraph into one graph. Findings become badges on the
 * node they flag; later readings of a node or edge refine earlier ones.
 */
export function mergeHops(hops: HopEvent[]): Merged {
  const nodes = new Map<string, MNode>();
  const edges = new Map<string, MEdge>();
  const findings = new Map<string, SGNode>();
  let focusId: string | null = null;
  let lastStep = 0;

  hops.forEach((hop, step) => {
    const g = hop.subgraph;
    if (!isSubgraph(g) || (g.nodes.length === 0 && g.edges.length === 0)) return;
    let drew = false;
    for (const n of g.nodes) {
      if (n.type === "finding") {
        findings.set(n.id, n);
        continue;
      }
      if (n.type === "claim") continue;
      if (n.is_focus) focusId = n.id;
      const prev = nodes.get(n.id);
      if (!prev) drew = true;
      nodes.set(n.id, {
        ...prev,
        ...Object.fromEntries(Object.entries(n).filter(([, v]) => v !== null && v !== undefined)),
        is_focus: Boolean(prev?.is_focus || n.is_focus),
        step: prev?.step ?? step,
        badges: prev?.badges ?? [],
      } as MNode);
    }
    for (const e of g.edges) {
      if (e.type === "FLAGS") {
        const f = findings.get(e.source);
        const target = nodes.get(e.target);
        if (f && target && !target.badges.includes(f.label)) {
          target.badges = [...target.badges, f.label];
        }
        continue;
      }
      const prev = edges.get(e.id);
      if (!prev) drew = true;
      edges.set(e.id, {
        ...prev,
        ...e,
        on_path: Boolean(prev?.on_path || e.on_path),
        step: prev?.step ?? step,
      });
    }
    if (drew) lastStep = step;
  });

  // Edges must join two drawn nodes.
  const kept = [...edges.values()].filter((e) => nodes.has(e.source) && nodes.has(e.target));
  return { nodes: [...nodes.values()], edges: kept, focusId, lastStep };
}

export function isSubgraphResponse(v: unknown): v is Subgraph {
  return isSubgraph(v);
}

/** Months since an ISO date, for "14 months old". */
export function monthsSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((now - t) / (30.44 * 86400_000)));
}

/** A node "needs attention": the owner left, it's outdated, or it's in a disagreement. */
export function isFlagged(n: MNode, edges: MEdge[]): boolean {
  if (n.left || n.stale) return true;
  if (n.flags?.some((f) => f === "orphan" || f === "bus_factor")) return true;
  return edges.some((e) => e.type === "CONTRADICTS" && (e.source === n.id || e.target === n.id));
}
