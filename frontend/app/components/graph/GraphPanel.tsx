"use client";

import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useReducedMotion } from "motion/react";
import useMeasure from "react-use-measure";
import type { AskStatus, HopEvent } from "../../lib/types";
import { isFlagged, layoutForHops, mergeHops, type MEdge, type Merged, type Subgraph } from "./model";
import { blastLayout, companyMap, egoLayout, pathLayout, type Positions, type Size } from "./layouts";
import { NODE_TYPES, type IslandData, type NodeData } from "./nodes";
import { EDGE_TYPES, type EdgeData, type EdgeKind } from "./edges";

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
function Camera({ frameKey, focusKey = "", duration }: { frameKey: string; focusKey?: string; duration: number }) {
  const flow = useReactFlow();
  // Every node has a size. (useNodesInitialized also waits for connection
  // handles, which the team islands don't have, so it never turned true.)
  const ready = useStore((s) => {
    if (s.nodeLookup.size === 0) return false;
    for (const n of s.nodeLookup.values()) if (!n.measured?.width || !n.measured?.height) return false;
    return true;
  });
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      flow.fitView({
        padding: 0.12,
        duration,
        maxZoom: 1.25,
        ...(focusKey ? { nodes: focusKey.split(" ").map((id) => ({ id })) } : {}),
      });
    }, 30);
    return () => clearTimeout(t);
  }, [frameKey, ready, flow, focusKey, duration]);
  return null;
}

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

  const zoomable = false; // Focus mode turns this on.

  return (
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
            proOptions={{ hideAttribution: true }}
          >
            <Camera
              frameKey={`map-${idle.nodes.length}-${size.width}-${size.height}-${highlightId ?? ""}`}
              focusKey={!showQuestion && highlightId && idle.nodes.some((n) => n.id === highlightId) ? highlightId : ""}
              duration={camera}
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
            proOptions={{ hideAttribution: true }}
          >
            {/* Each hop: glide to what it drew. The answer: frame the whole walk. */}
            <Camera
              frameKey={`q-${question.layout}-${question.merged.lastStep}-${question.nodes.length}-${final}-${size.width}-${size.height}`}
              focusKey={final ? "" : question.hopIds}
              duration={camera}
            />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
