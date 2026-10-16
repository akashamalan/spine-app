"use client";

import { BaseEdge, EdgeLabelRenderer, getStraightPath, type Edge, type EdgeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import type { CSSProperties } from "react";

export type EdgeKind = "normal" | "stale" | "superseded" | "path" | "contradiction" | "left";

export type EdgeData = {
  kind: EdgeKind;
  /** Plain words, shown on the line only for edges on SPINE's path. */
  label?: string;
  /** The full sentence behind it (a claim), shown on hover. */
  detail?: string;
  dim?: boolean;
};

export type SpineEdge = Edge<EdgeData>;

export const PATH_BLUE = "#0A84FF";

const STYLE: Record<EdgeKind, CSSProperties> = {
  normal: { stroke: "rgba(255,255,255,0.5)", strokeWidth: 2 },
  stale: { stroke: "rgba(255,255,255,0.25)", strokeWidth: 2 },
  superseded: { stroke: "rgba(255,255,255,0.2)", strokeWidth: 2, strokeDasharray: "6 5" },
  path: { stroke: PATH_BLUE, strokeWidth: 2.5 },
  contradiction: { stroke: "#FF453A", strokeWidth: 2.25 },
  left: { stroke: "rgba(255,255,255,0.35)", strokeWidth: 2, strokeDasharray: "4 5" },
};

export function SpineEdgeView({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<SpineEdge>) {
  const kind = data?.kind ?? "normal";
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const showLabel = (kind === "path" || kind === "contradiction") && data?.label;
  const hoverText = data?.detail ?? (kind === "superseded" ? "replaced" : data?.label);

  return (
    <g style={{ opacity: data?.dim ? 0.35 : 1, transition: "opacity 0.4s" }}>
      {hoverText && <title>{hoverText}</title>}
      {/* Wide invisible stroke so the hover tooltip is easy to hit. */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={14} />
      <BaseEdge id={id} path={path} style={STYLE[kind]} />
      {(showLabel || kind === "contradiction") && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[13px]"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: kind === "contradiction" ? "rgba(60,16,14,0.92)" : "rgba(14,24,44,0.88)",
              color: kind === "contradiction" ? "#ffb4ae" : "#cfe4ff",
              opacity: data?.dim ? 0.35 : 1,
            }}
          >
            {kind === "contradiction" && <Zap aria-hidden size={13} className="fill-current" />}
            {kind === "contradiction" ? "disagree" : data?.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

export const EDGE_TYPES = { spine: SpineEdgeView };
