"use client";

import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import useMeasure from "react-use-measure";
import type { AskStatus, HopEvent } from "../../lib/types";
import { API_BASE } from "../../lib/useSpine";
import {
  isFlagged,
  isSubgraphResponse,
  layoutForHops,
  mergeHops,
  type MEdge,
  type Merged,
  type Subgraph,
} from "./model";
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

function edgeKind(e: MEdge, merged: Merged): EdgeKind {
  if (e.type === "CONTRADICTS") return "contradiction";
  if (e.superseded) return "superseded";
  const source = merged.nodes.find((n) => n.id === e.source);
  if (source?.left) return "left";
  if (e.on_path) return "path";
  if (e.stale) return "stale";
  return "normal";
}

// ── The question graph ───────────────────────────────────────────────────

function useQuestionGraph(hops: HopEvent[], size: Size, highlightId: string | null) {
  return useMemo(() => {
    const merged = mergeHops(hops);
    const layout = layoutForHops(hops);
    let pos: Positions;
    if (layout === "ego") pos = egoLayout(merged.nodes, merged.focusId, size);
    else if (layout === "blast") pos = blastLayout(merged.nodes, merged.edges, merged.focusId, size);
    else pos = pathLayout(merged.nodes, merged.edges, merged.focusId, size);

    const nodes: Node<NodeData>[] = merged.nodes
      .filter((n) => pos.has(n.id) && n.type in NODE_TYPES)
      .map((n) => ({
        id: n.id,
        type: n.type,
        position: pos.get(n.id)!,
        data: {
          n,
          variant: "full",
          highlight: n.id === highlightId,
          flagged: isFlagged(n, merged.edges),
        },
        zIndex: n.is_focus ? 2 : 1,
      }));
    const edges: Edge<EdgeData>[] = merged.edges.map((e) => {
      const kind = edgeKind(e, merged);
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
        },
      };
    });
    return { merged, layout, nodes, edges };
  }, [hops, size, highlightId]);
}

// ── The idle company map ─────────────────────────────────────────────────

function useCompanyMap(backendUp: boolean) {
  const [map, setMap] = useState<Subgraph | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!backendUp) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/graph/overview`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`overview ${r.status}`))))
      .then((data: unknown) => {
        if (cancelled) return;
        if (isSubgraphResponse(data)) {
          setMap(data);
          setFailed(false);
        } else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [backendUp]);
  return { map, failed };
}

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

/** Re-frames the view whenever `frameKey` changes, once nodes are measured. */
function Camera({ frameKey, focusKey = "" }: { frameKey: string; focusKey?: string }) {
  const flow = useReactFlow();
  const ready = useNodesInitialized();
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      flow.fitView({
        padding: 0.12,
        duration: 600,
        maxZoom: 1.25,
        ...(focusKey ? { nodes: focusKey.split(" ").map((id) => ({ id })) } : {}),
      });
    }, 30);
    return () => clearTimeout(t);
  }, [frameKey, ready, flow, focusKey]);
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
}: {
  hops: HopEvent[];
  status: AskStatus;
  highlightId: string | null;
  backendUp: boolean;
}) {
  const [ref, bounds] = useMeasure();
  const size = useMemo(() => ({ width: bounds.width, height: bounds.height }), [bounds.width, bounds.height]);
  const asking = hops.length > 0 || status === "asking";
  const question = useQuestionGraph(hops, size, highlightId);
  const { map, failed } = useCompanyMap(backendUp);
  const idle = useMemo(() => mapElements(map, size, highlightId), [map, size, highlightId]);
  const showQuestion = asking && question.nodes.length > 0;

  const zoomable = false; // Focus mode turns this on.

  return (
    <div ref={ref} className="spine-flow relative min-h-0 flex-1">
      {/* The company, always underneath; it steps back while a question is walked. */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{ opacity: showQuestion ? 0.15 : 1 }}
        aria-hidden={showQuestion}
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
            <Camera frameKey={`q-${question.layout}-${question.nodes.length}-${size.width}-${size.height}`} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
}
