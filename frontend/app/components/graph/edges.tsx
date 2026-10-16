"use client";

import { EdgeLabelRenderer, getStraightPath, type Edge, type EdgeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { useEffect, useRef, type CSSProperties } from "react";

export type EdgeKind = "normal" | "stale" | "superseded" | "path" | "contradiction" | "left";

export type EdgeData = {
  kind: EdgeKind;
  /** Plain words, shown on the line only for edges on SPINE's path. */
  label?: string;
  /** The full sentence behind it (a claim), shown on hover. */
  detail?: string;
  dim?: boolean;
  /** Draw the line in (ms delay). Unset: it simply appears. */
  draw?: number;
  /** Send one light along this line (ms delay). Only ever set on one edge. */
  travel?: number;
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

const TRAVEL_MS = 700;

/**
 * One light along the line, once. SMIL timing is relative to when the SVG
 * was created, so an animation added later with begin="0s" would count as
 * already over; it is started explicitly instead.
 */
function Traveller({ path, delay }: { path: string; delay: number }) {
  const motion = useRef<SVGAnimateMotionElement>(null);
  const fade = useRef<SVGAnimateElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      motion.current?.beginElement();
      fade.current?.beginElement();
    }, delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <circle r={4.5} fill="#cfe4ff" opacity={0} style={{ filter: "drop-shadow(0 0 6px #0A84FF)" }}>
      <animateMotion ref={motion} begin="indefinite" dur={`${TRAVEL_MS}ms`} path={path} fill="freeze" />
      <animate
        ref={fade}
        attributeName="opacity"
        begin="indefinite"
        dur={`${TRAVEL_MS}ms`}
        values="0;1;1;0"
        keyTimes="0;0.15;0.8;1"
        fill="remove"
      />
    </circle>
  );
}

export function SpineEdgeView({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<SpineEdge>) {
  const kind = data?.kind ?? "normal";
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const showLabel = (kind === "path" || kind === "contradiction") && data?.label;
  const hoverText = data?.detail ?? (kind === "superseded" ? "replaced" : data?.label);
  const drawing = data?.draw !== undefined;

  return (
    <g style={{ opacity: data?.dim ? 0.35 : 1, transition: "opacity 0.4s" }}>
      {hoverText && <title>{hoverText}</title>}
      {/* Wide invisible stroke so the hover tooltip is easy to hit. */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={14} />
      <path
        id={id}
        d={path}
        fill="none"
        className={`react-flow__edge-path${drawing ? " spine-draw" : ""}`}
        pathLength={drawing ? 1 : undefined}
        style={{ ...STYLE[kind], ...(drawing ? { animationDelay: `${data!.draw}ms` } : {}) }}
      />
      {data?.travel !== undefined && <Traveller key={id} path={path} delay={data.travel} />}
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
