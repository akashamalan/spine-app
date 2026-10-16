"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useReducedMotion } from "motion/react";
import { Check, ChevronDown, Copy, Info, Maximize, Minimize, Scan, Terminal, X, Zap } from "lucide-react";
import useMeasure from "react-use-measure";
import type { AskStatus, HopEvent } from "../../lib/types";
import { isFlagged, layoutForHops, mergeHops, type MEdge, type Merged, type Subgraph } from "./model";
import { blastLayout, companyMap, egoLayout, pathLayout, type Positions, type Size } from "./layouts";
import { NODE_TYPES, type IslandData, type NodeData } from "./nodes";
import { EDGE_TYPES, PATH_BLUE, type EdgeData, type EdgeKind } from "./edges";

const VERBS: Record<string, string> = {
  OWNS: "owns",
  DEPENDS_ON: "depends on",
  MENTIONS: "mentions",
  SUPERSEDES: "replaced by",
  MEMBER_OF: "member of",
  AUTHORED: "wrote",
  KNOWS_ABOUT: "knows about",
  DRIVEN_BY: "decided by",
};

/** Hop timing (ms). Nodes pop first, then their path lines draw, then one light travels. */
const POP_STAGGER = 40;
const DRAW_AFTER = 250;
const DRAW_MS = 500;

function edgeKind(e: MEdge, merged: Merged): EdgeKind {
  if (e.type === "CONTRADICTS") return "contradiction";
  if (e.superseded) return "superseded";
  const source = merged.nodes.find((n) => n.id === e.source);
  if (source?.left) return "left";
  if (e.on_path) return "path";
  if (e.stale) return "stale";
  return "normal";
}

/** Each item's place among the items that arrived in the same hop. */
function rankWithinStep<T extends { step: number }>(items: T[]): Map<T, number> {
  const seen = new Map<number, number>();
  const rank = new Map<T, number>();
  for (const it of items) {
    const i = seen.get(it.step) ?? 0;
    rank.set(it, i);
    seen.set(it.step, i + 1);
  }
  return rank;
}

// ── The question graph ───────────────────────────────────────────────────

function useQuestionGraph(
  hops: HopEvent[],
  size: Size,
  highlightId: string | null,
  final: boolean,
  motion: boolean
) {
  return useMemo(() => {
    const merged = mergeHops(hops);
    const layout = layoutForHops(hops);
    let pos: Positions;
    if (layout === "ego") pos = egoLayout(merged.nodes, merged.focusId, size);
    else if (layout === "blast") pos = blastLayout(merged.nodes, merged.edges, merged.focusId, size);
    else pos = pathLayout(merged.nodes, merged.edges, merged.focusId, size);

    const kinds = new Map(merged.edges.map((e) => [e.id, edgeKind(e, merged)]));

    // The path SPINE took: its lines, the things they join, and any disagreement.
    const onPath = new Set<string>();
    for (const e of merged.edges) {
      const k = kinds.get(e.id);
      if (k === "path" || k === "contradiction") onPath.add(e.source).add(e.target);
    }
    if (merged.focusId) onPath.add(merged.focusId);
    // Dim the rest only once the answer is in, and only if there is a path to keep bright.
    const dimOffPath = final && merged.edges.some((e) => kinds.get(e.id) === "path");

    const drawn = merged.nodes.filter((n) => pos.has(n.id) && n.type in NODE_TYPES);
    const nodeRank = rankWithinStep(drawn);
    const nodes: Node<NodeData>[] = drawn.map((n) => {
      const flagged = isFlagged(n, merged.edges);
      return {
        id: n.id,
        type: n.type,
        position: pos.get(n.id)!,
        data: {
          n,
          variant: "full",
          highlight: n.id === highlightId,
          flagged,
          dim: dimOffPath && !onPath.has(n.id),
          enter: motion ? nodeRank.get(n)! * POP_STAGGER : undefined,
          pulse: motion && flagged,
        },
        zIndex: n.is_focus ? 2 : 1,
      };
    });

    const pathEdges = merged.edges.filter((e) => kinds.get(e.id) === "path");
    const edgeRank = rankWithinStep(pathEdges);
    // The newest line on the path carries the one traveller.
    const newest = pathEdges.reduce<MEdge | null>((a, e) => (!a || e.step >= a.step ? e : a), null);

    const edges: Edge<EdgeData>[] = merged.edges.map((e) => {
      const kind = kinds.get(e.id)!;
      const draw = motion && kind === "path" ? DRAW_AFTER + edgeRank.get(e)! * POP_STAGGER : undefined;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "spine",
        zIndex: kind === "path" || kind === "contradiction" ? 1 : 0,
        data: {
          kind,
          label: VERBS[e.type] ?? e.type.toLowerCase().replace(/_/g, " "),
          detail: e.type === "MENTIONS" && e.label ? e.label : undefined,
          dim: dimOffPath && kind !== "path" && kind !== "contradiction",
          draw,
          travel: motion && e === newest && draw !== undefined ? draw + DRAW_MS : undefined,
        },
      };
    });

    // What the camera frames for the newest hop: what it drew, plus the subject.
    const hopIds = new Set<string>();
    for (const n of drawn) if (n.step === merged.lastStep) hopIds.add(n.id);
    for (const e of merged.edges) {
      if (e.step === merged.lastStep) hopIds.add(e.source).add(e.target);
    }
    if (merged.focusId && pos.has(merged.focusId)) hopIds.add(merged.focusId);

    return { merged, layout, nodes, edges, hopIds: [...hopIds].sort().join(" ") };
  }, [hops, size, highlightId, final, motion]);
}

// ── The idle company map ─────────────────────────────────────────────────

function mapElements(map: Subgraph | null, size: Size, highlightId: string | null) {
  if (!map) return { nodes: [] as Node[], edges: [] as Edge[] };
  const { positions, islands } = companyMap(map.nodes, map.edges, size);
  const islandNodes: Node<IslandData>[] = islands.map((i) => ({
    id: i.id,
    type: "team",
    position: { x: i.x + i.width / 2, y: i.y + i.height / 2 },
    data: { label: i.label, width: i.width, height: i.height, warn: i.warn },
    zIndex: 0,
    selectable: false,
  }));
  const items: Node<NodeData>[] = map.nodes
    .filter((n) => positions.has(n.id))
    .map((n) => ({
      id: n.id,
      type: n.type,
      position: positions.get(n.id)!,
      data: { n, variant: "chip", highlight: n.id === highlightId },
      zIndex: 1,
    }));
  return { nodes: [...islandNodes, ...items] as Node[], edges: [] as Edge[] };
}

// ── Camera ───────────────────────────────────────────────────────────────

/**
 * Re-frames the view whenever `frameKey` changes, once nodes are measured.
 * `focusKey` (space-separated ids) narrows the frame to those nodes.
 */
function Camera({
  frameKey,
  focusKey = "",
  duration,
  onInit,
  minZoom,
}: {
  frameKey: string;
  focusKey?: string;
  duration: number;
  /** Hands the live instance up so the panel's Fit button can call it directly. */
  onInit?: (inst: ReactFlowInstance) => void;
  /** Never zoom out past this to fit everything in — labels stay readable, the
   *  map becomes pannable instead of microscopic. Unset: fit at any zoom. */
  minZoom?: number;
}) {
  const flow = useReactFlow();
  // Every node has a size. (useNodesInitialized also waits for connection
  // handles, which the team islands don't have, so it never turned true.)
  const ready = useStore((s) => {
    if (s.nodeLookup.size === 0) return false;
    for (const n of s.nodeLookup.values()) if (!n.measured?.width || !n.measured?.height) return false;
    return true;
  });
  useEffect(() => {
    onInit?.(flow);
  }, [flow, onInit]);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      flow.fitView({
        padding: 0.12,
        duration,
        maxZoom: 1.25,
        ...(minZoom !== undefined ? { minZoom } : {}),
        ...(focusKey ? { nodes: focusKey.split(" ").map((id) => ({ id })) } : {}),
      });
    }, 30);
    return () => clearTimeout(t);
  }, [frameKey, ready, flow, focusKey, duration, minZoom]);
  return null;
}

// ── Legend ───────────────────────────────────────────────────────────────

function Swatch({ children }: { children: ReactNode }) {
  return <span className="grid h-3.5 w-3.5 shrink-0 place-items-center">{children}</span>;
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />;
}

const LEGEND_ITEMS: { swatch: ReactNode; label: string }[] = [
  { swatch: <Dot color="var(--fresh)" />, label: "Up to date" },
  { swatch: <Dot color="var(--aging)" />, label: "Getting old" },
  { swatch: <Dot color="var(--stale)" />, label: "Probably outdated" },
  {
    swatch: <span aria-hidden className="h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed border-white/60" />,
    label: "Has left the company",
  },
  {
    swatch: <span aria-hidden className="h-[2px] w-3.5 rounded-full" style={{ background: PATH_BLUE }} />,
    label: "The path SPINE took",
  },
  { swatch: <Zap aria-hidden size={12} className="fill-stale text-stale" />, label: "Two documents disagree" },
];

function Legend() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="absolute bottom-3 left-3 z-10">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Show legend"
          aria-expanded={false}
          className="glass-thin flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-white/75 transition-colors hover:text-white"
        >
          <Info aria-hidden size={13} />
          Legend
        </button>
      </div>
    );
  }
  return (
    <div className="absolute bottom-3 left-3 z-10">
      <div className="glass-thin flex flex-col gap-1.5 rounded-2xl px-3 py-2.5" role="group" aria-label="Legend">
        <div className="mb-0.5 flex items-center justify-between gap-5">
          <span className="text-[12px] font-medium uppercase tracking-wide text-white/60">Legend</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Hide legend"
            aria-expanded={true}
            className="text-white/50 transition-colors hover:text-white"
          >
            <ChevronDown aria-hidden size={14} />
          </button>
        </div>
        {LEGEND_ITEMS.map((it) => (
          <div key={it.label} className="flex items-center gap-2 text-[13px] text-white/80">
            <Swatch>{it.swatch}</Swatch>
            {it.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── "Show how I did this" drawer ────────────────────────────────────────

type HopRow = { hop: number; title: string; cypher?: string; count: number | null };

/** Plain-words fallback if a hop's own description is ever missing. */
const TOOL_TITLES: Record<string, string> = {
  classify_intent: "Understanding your question",
  resolve_entity: "Finding that in the graph",
  who_knows: "Finding who knows about this",
  broken_path: "Checking ownership chain",
  check_findings: "Checking for open findings",
  blast_radius: "Tracing what depends on this",
  find_entry_points: "Finding relevant claims",
  neighbours: "Gathering context from neighbours",
};

/** Every tool names its array of findings differently; try each in turn. */
const RESULT_KEYS = ["results", "people", "ownership_records", "findings", "affected_ids", "edges"] as const;

function hopResultCount(ev: HopEvent | undefined): number | null {
  if (!ev) return null;
  for (const key of RESULT_KEYS) {
    const v = ev[key];
    if (Array.isArray(v)) return v.length;
  }
  return typeof ev.count === "number" ? ev.count : null;
}

/** One row per hop number, pairing its "checking" (title) and "result" (Cypher, count) events. */
function hopRows(hops: HopEvent[]): HopRow[] {
  const byHop = new Map<number, { checking?: HopEvent; result?: HopEvent }>();
  for (const h of hops) {
    const n = typeof h.hop === "number" ? h.hop : Number(h.hop);
    if (!Number.isFinite(n)) continue;
    const entry = byHop.get(n) ?? {};
    if (h.action === "checking") entry.checking = h;
    else if (h.action === "result") entry.result = h;
    byHop.set(n, entry);
  }
  return [...byHop.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, { checking, result }]) => ({
      hop: n,
      title: checking?.description?.replace(/\.\.\.$/, "") ?? TOOL_TITLES[result?.tool ?? ""] ?? `Step ${n}`,
      cypher: typeof result?.cypher === "string" && result.cypher ? result.cypher : undefined,
      count: hopResultCount(result),
    }));
}

function Drawer({ open, onClose, hops }: { open: boolean; onClose: () => void; hops: HopEvent[] }) {
  const rows = useMemo(() => hopRows(hops), [hops]);
  const [copiedHop, setCopiedHop] = useState<number | null>(null);

  const copy = useCallback((text: string, hop: number) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedHop(hop);
        setTimeout(() => setCopiedHop((h) => (h === hop ? null : h)), 1500);
      })
      .catch(() => {});
  }, []);

  return (
    <div
      role="region"
      aria-label="How SPINE found this"
      aria-hidden={!open}
      className={`glass-strong absolute inset-x-0 bottom-0 z-20 flex h-[45%] flex-col overflow-hidden rounded-t-[22px] transition-transform duration-300 ease-out ${
        open ? "translate-y-0" : "translate-y-full pointer-events-none"
      }`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-[15px] font-semibold text-white">How SPINE found this</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-7 w-7 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X aria-hidden size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-white/60">Ask a question to see the steps SPINE took.</p>
        ) : (
          rows.map((row) => (
            <div key={row.hop} className="border-b border-white/10 px-4 py-3 last:border-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-medium text-white">{row.title}</p>
                {row.count !== null && (
                  <span className="shrink-0 text-[13px] text-white/60">
                    {row.count} {row.count === 1 ? "result" : "results"}
                  </span>
                )}
              </div>
              {row.cypher ? (
                <div className="relative mt-2">
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-3 pr-10 font-mono text-[12px] leading-relaxed text-white/80">
                    {row.cypher}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copy(row.cypher!, row.hop)}
                    aria-label="Copy query"
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
                  >
                    {copiedHop === row.hop ? <Check aria-hidden size={14} /> : <Copy aria-hidden size={14} />}
                  </button>
                </div>
              ) : (
                <p className="mt-1.5 text-[13px] text-white/50">No database query for this step.</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Header icon buttons ──────────────────────────────────────────────────

function HeaderButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`grid h-8 w-8 place-items-center rounded-full transition-colors active:scale-[0.94] ${
        active ? "bg-primary text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      {icon}
    </button>
  );
}

// ── The panel ────────────────────────────────────────────────────────────

const FLOW_PROPS = {
  colorMode: "dark" as const,
  nodeOrigin: [0.5, 0.5] as [number, number],
  nodesDraggable: false,
  nodesConnectable: false,
  elementsSelectable: false,
  panOnScroll: false,
  zoomOnDoubleClick: false,
  minZoom: 0.2,
  maxZoom: 2,
  style: { background: "transparent" },
  proOptions: { hideAttribution: true },
};

export function GraphPanel({
  hops,
  status,
  highlightId,
  backendUp,
  companyMap: map,
  companyMapFailed: failed,
}: {
  hops: HopEvent[];
  status: AskStatus;
  highlightId: string | null;
  backendUp: boolean;
  companyMap: Subgraph | null;
  companyMapFailed: boolean;
}) {
  const [ref, bounds] = useMeasure();
  const size = useMemo(() => ({ width: bounds.width, height: bounds.height }), [bounds.width, bounds.height]);
  const motion = !useReducedMotion();
  const asking = hops.length > 0 || status === "asking";
  const final = status === "done";
  const question = useQuestionGraph(hops, size, highlightId, final, motion);
  const idle = useMemo(() => mapElements(map, size, highlightId), [map, size, highlightId]);
  const showQuestion = asking && question.nodes.length > 0;
  // The company steps back the moment a question is asked, before anything is drawn.
  const stepBack = status === "asking" || showQuestion;
  const camera = motion ? 600 : 0;
  // True idle: nothing has ever been asked this session (not "done, but history still showing").
  const neverAsked = hops.length === 0 && status !== "asking";

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Scroll-zoom is only offered full-screen, where there's room to use it.
  const zoomable = expanded;

  const idleFlowRef = useRef<ReactFlowInstance | null>(null);
  const questionFlowRef = useRef<ReactFlowInstance | null>(null);
  const handleFit = useCallback(() => {
    const inst = showQuestion ? questionFlowRef.current : idleFlowRef.current;
    inst?.fitView({ padding: 0.12, duration: motion ? 400 : 0, maxZoom: 1.25 });
  }, [showQuestion, motion]);

  // Esc collapses the full-screen view, same as the close button.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  const panelBody = (
    <>
      <header className="flex shrink-0 items-start justify-between gap-3 px-6 pt-5 pb-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight">How SPINE found it</h2>
          <p className="mt-0.5 text-[13px] text-white/70">
            {neverAsked
              ? "This is your company. Ask something and watch SPINE walk through it."
              : "The path it walked through your company"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <HeaderButton icon={<Scan aria-hidden size={16} />} label="Fit to screen" onClick={handleFit} />
          <HeaderButton
            icon={<Terminal aria-hidden size={16} />}
            label="Show how I did this"
            active={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
          />
          <HeaderButton
            icon={expanded ? <Minimize aria-hidden size={16} /> : <Maximize aria-hidden size={16} />}
            label={expanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded((v) => !v)}
          />
        </div>
      </header>

      <div ref={ref} className="spine-flow relative min-h-0 flex-1">
        {/* The company, always underneath; it steps back while a question is walked. */}
        <div
          className="absolute inset-0 transition-[opacity,filter] duration-500"
          style={{ opacity: stepBack ? 0.15 : 1, filter: stepBack ? "blur(2px)" : "none" }}
          aria-hidden={stepBack}
        >
          <ReactFlowProvider>
            <ReactFlow
              {...FLOW_PROPS}
              nodes={idle.nodes}
              edges={idle.edges}
              nodeTypes={NODE_TYPES}
              zoomOnScroll={zoomable}
              preventScrolling={zoomable}
            >
              <Camera
                frameKey={`map-${idle.nodes.length}-${size.width}-${size.height}-${highlightId ?? ""}-${expanded}`}
                focusKey={!showQuestion && highlightId && idle.nodes.some((n) => n.id === highlightId) ? highlightId : ""}
                duration={camera}
                // Team/person labels are 13px CSS; never zoom the idle map out
                // past 1:1 to fit everyone in, or the names stop being readable.
                minZoom={1}
                onInit={(inst) => {
                  idleFlowRef.current = inst;
                }}
              />
            </ReactFlow>
          </ReactFlowProvider>
          {!map && (
            <p className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-white/70">
              {failed ? "The company map isn't available right now." : backendUp ? "Drawing your company…" : ""}
            </p>
          )}
        </div>

        {/* The walk for the current question. */}
        <div className={`absolute inset-0 ${showQuestion ? "" : "pointer-events-none"}`}>
          <ReactFlowProvider>
            <ReactFlow
              {...FLOW_PROPS}
              nodes={showQuestion ? question.nodes : []}
              edges={showQuestion ? question.edges : []}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              zoomOnScroll={zoomable}
              preventScrolling={zoomable}
            >
              {/* Each hop: glide to what it drew. The answer: frame the whole walk. */}
              <Camera
                frameKey={`q-${question.layout}-${question.merged.lastStep}-${question.nodes.length}-${final}-${size.width}-${size.height}-${expanded}`}
                focusKey={final ? "" : question.hopIds}
                duration={camera}
                onInit={(inst) => {
                  questionFlowRef.current = inst;
                }}
              />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        <Legend />
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} hops={hops} />
      </div>
    </>
  );

  if (expanded) {
    return createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm md:p-8"
        onClick={() => setExpanded(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="How SPINE found it — expanded"
          onClick={(e) => e.stopPropagation()}
          className="glass-strong relative flex h-full w-full flex-col overflow-hidden rounded-[28px] shadow-2xl"
        >
          {panelBody}
        </div>
      </div>,
      document.body
    );
  }

  return <div className="flex h-full min-h-0 flex-col">{panelBody}</div>;
}
