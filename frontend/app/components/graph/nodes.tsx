"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { FileText, Server } from "lucide-react";
import type { MNode, SGNode } from "./model";
import { monthsSince } from "./model";
import { confidenceLabel, findingLabel } from "../../lib/labels";
import { hueFor, initials } from "../../lib/people";

export type NodeData = {
  n: MNode | SGNode;
  /** "chip" is the compact form used on the company map. */
  variant: "full" | "chip";
  dim?: boolean;
  highlight?: boolean;
  flagged?: boolean;
};

export type SpineNode = Node<NodeData>;

/** Invisible centre handles: edges run centre to centre, under the nodes. */
function Anchors() {
  const style = { opacity: 0, top: "50%", left: "50%", width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 };
  return (
    <>
      <Handle type="target" position={Position.Top} style={style} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} style={style} isConnectable={false} />
    </>
  );
}

function teamTint(n: SGNode): string {
  return `hsl(${hueFor(n.team_id || n.team || n.label)} 50% 30%)`;
}

const RING_COLOR = { fresh: "var(--fresh)", aging: "var(--aging)", stale: "var(--stale)" };

function plainAge(months: number | null): string | null {
  if (months === null) return null;
  if (months < 1) return "New";
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} old`;
  const years = Math.floor(months / 12);
  return months % 12 === 0 || years >= 3
    ? `${years} ${years === 1 ? "year" : "years"} old`
    : `${months} months old`;
}

function leftText(n: SGNode): string {
  if (!n.left_at) return "Has left";
  const d = new Date(n.left_at);
  return `Left in ${d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`;
}

/** One plain sentence for the hover tooltip. */
export function nodeSentence(n: SGNode): string {
  switch (n.type) {
    case "person": {
      if (n.left) return `${n.label} ${leftText(n).toLowerCase()} the company.`;
      const role = n.sublabel ? `, ${n.sublabel}` : "";
      if (n.confidence == null) return `${n.label}${role}${n.team ? ` in ${n.team}` : ""}.`;
      return `${n.label}${role}. What SPINE knows about them here is ${confidenceLabel(n.confidence).label.toLowerCase()}.`;
    }
    case "service":
      if (n.flags?.includes("orphan")) return `${n.label}: nobody looks after this.`;
      if (n.flags?.includes("bus_factor")) return `${n.label}: only one person knows this.`;
      return `${n.label} is a ${n.sublabel ?? "service"}.`;
    case "document": {
      const age = plainAge(monthsSince(n.asserted_at));
      return `${n.label}${age ? `, written ${age.replace(" old", "")} ago` : ""}.`;
    }
    default:
      return n.label;
  }
}

function Badges({ n }: { n: SGNode }) {
  const badges = "badges" in n ? (n as MNode).badges : [];
  if (!badges.length) return null;
  const labels = [...new Set(badges.map(findingLabel))];
  return (
    <span className="absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[#3b1210] px-2 py-0.5 text-[13px] font-medium text-[#ffb4ae] ring-1 ring-stale/60">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-stale" />
      {labels[0]}
      {labels.length > 1 && <span className="text-[#ffb4ae]/80">+{labels.length - 1}</span>}
    </span>
  );
}

function Tooltip({ text }: { text: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[240px] -translate-x-1/2 rounded-xl bg-[#14161e]/95 px-3 py-1.5 text-[13px] leading-snug text-white opacity-0 shadow-lg ring-1 ring-white/15 transition-opacity duration-150 group-hover:opacity-100"
    >
      {text}
    </span>
  );
}

function shell(data: NodeData, extra = "") {
  return `group relative transition-[transform,opacity] duration-200 hover:-translate-y-0.5 ${
    data.dim ? "opacity-35" : "opacity-100"
  } ${extra}`;
}

// ── Person ───────────────────────────────────────────────────────────────

function ConfidenceRing({ confidence, size }: { confidence: number | null | undefined; size: number }) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  if (confidence == null) {
    return (
      <svg aria-hidden width={size} height={size} className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={1.5} />
      </svg>
    );
  }
  const { token } = confidenceLabel(confidence);
  const fraction = token === "fresh" ? 1 : token === "aging" ? 0.75 : 1;
  const width = token === "stale" ? 1.5 : 3;
  return (
    <svg aria-hidden width={size} height={size} className="absolute inset-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={width} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={RING_COLOR[token]}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={`${c * fraction} ${c}`}
      />
    </svg>
  );
}

export function PersonNode({ data }: NodeProps<SpineNode>) {
  const { n } = data;
  const ghost = Boolean(n.left);
  const sentence = nodeSentence(n);

  if (data.variant === "chip") {
    return (
      <div className={shell(data)} aria-label={sentence}>
        <Anchors />
        <Tooltip text={sentence} />
        <div
          className={`flex h-[34px] w-[158px] items-center gap-2 rounded-full pl-1 pr-3 ${
            ghost ? "border border-dashed border-white/40 opacity-40" : "bg-white/[0.07]"
          } ${data.highlight ? "ring-2 ring-primary" : ""}`}
        >
          <span
            aria-hidden
            className={`grid h-[28px] w-[28px] shrink-0 place-items-center rounded-full text-[13px] font-semibold ${
              ghost ? "border border-dashed border-white/60 text-white/80" : "text-white"
            }`}
            style={ghost ? undefined : { background: teamTint(n) }}
          >
            {initials(n.label)}
          </span>
          <span className="truncate text-[13px] text-white">{n.label}</span>
        </div>
      </div>
    );
  }

  const size = n.is_focus ? 62 : 44;
  return (
    <div className={shell(data, "flex w-[120px] flex-col items-center")} aria-label={sentence}>
      <Anchors />
      <Tooltip text={sentence} />
      <Badges n={n} />
      <div
        className={`relative grid place-items-center rounded-full ${ghost ? "opacity-40" : ""} ${
          data.flagged ? "shadow-[0_0_0_3px_rgba(255,69,58,0.55)]" : ""
        } ${data.highlight ? "shadow-[0_0_0_3px_var(--primary)]" : ""} ${
          n.is_focus ? "shadow-[0_0_24px_6px_rgba(10,132,255,0.35)]" : ""
        }`}
        style={{ width: size, height: size }}
      >
        {!ghost && <ConfidenceRing confidence={n.confidence} size={size} />}
        <span
          className={`grid place-items-center rounded-full font-semibold ${
            ghost ? "border-[1.5px] border-dashed border-white/70 text-white/90" : "text-white"
          }`}
          style={{
            width: size - 10,
            height: size - 10,
            fontSize: n.is_focus ? 17 : 13,
            background: ghost ? "transparent" : teamTint(n),
          }}
        >
          {initials(n.label)}
        </span>
      </div>
      <span className={`mt-1.5 max-w-[120px] truncate text-center text-[13px] font-medium ${ghost ? "text-white/55" : "text-white"}`}>
        {n.label}
      </span>
      {ghost && <span className="text-[13px] text-white/55">{leftText(n)}</span>}
    </div>
  );
}

// ── Service ──────────────────────────────────────────────────────────────

export function ServiceNode({ data }: NodeProps<SpineNode>) {
  const { n } = data;
  const risky = n.flags?.some((f) => f === "orphan" || f === "bus_factor");
  const sentence = nodeSentence(n);
  const chip = data.variant === "chip";
  return (
    <div className={shell(data)} aria-label={sentence}>
      <Anchors />
      <Tooltip text={sentence} />
      {!chip && <Badges n={n} />}
      <div
        className={`flex items-center gap-2 rounded-full border bg-[rgba(24,26,36,0.78)] ${
          chip ? "h-[34px] w-[158px] px-3" : n.is_focus ? "h-[52px] px-5" : "h-[40px] px-4"
        } ${data.flagged ? "border-stale/80 shadow-[0_0_0_3px_rgba(255,69,58,0.35)]" : "border-white/20"} ${
          data.highlight ? "shadow-[0_0_0_3px_var(--primary)]" : ""
        } ${n.is_focus ? "shadow-[0_0_28px_8px_rgba(10,132,255,0.35)] border-primary/70" : ""}`}
      >
        <Server aria-hidden size={chip ? 14 : n.is_focus ? 20 : 16} className="shrink-0 text-white/75" />
        <span
          className={`truncate whitespace-nowrap font-medium text-white ${
            chip ? "text-[13px]" : n.is_focus ? "text-[20px]" : "text-[15px]"
          }`}
        >
          {n.label}
        </span>
        <span
          aria-hidden
          className={`ml-auto h-2 w-2 shrink-0 rounded-full ${risky ? "bg-stale" : "bg-fresh"}`}
        />
      </div>
    </div>
  );
}

// ── Document ─────────────────────────────────────────────────────────────

export function DocumentNode({ data }: NodeProps<SpineNode>) {
  const { n } = data;
  const months = monthsSince(n.asserted_at);
  const age = plainAge(months);
  const ageDot = months === null ? "" : months >= 12 ? "bg-stale" : months >= 6 ? "bg-aging" : "bg-fresh";
  const sentence = nodeSentence(n);
  return (
    <div className={shell(data)} aria-label={sentence}>
      <Anchors />
      <Tooltip text={sentence} />
      <Badges n={n} />
      <div
        className={`flex w-[180px] flex-col gap-1 rounded-2xl border bg-[rgba(24,26,36,0.78)] px-3 py-2 ${
          data.flagged ? "border-stale/70" : "border-white/18"
        } ${data.highlight ? "shadow-[0_0_0_3px_var(--primary)]" : ""}`}
      >
        <span className="flex items-start gap-1.5">
          <FileText aria-hidden size={14} className="mt-0.5 shrink-0 text-white/70" />
          <span className="line-clamp-2 text-[13px] font-medium leading-snug text-white">{n.label}</span>
        </span>
        {age && (
          <span className="flex items-center gap-1.5 self-start rounded-full bg-white/[0.08] px-2 py-0.5 text-[13px] text-white/80">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${ageDot}`} />
            {age}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Team island (company map) ────────────────────────────────────────────

export type IslandData = { label: string; width: number; height: number; warn?: boolean };

export function TeamNode({ data }: NodeProps<Node<IslandData>>) {
  return (
    <div
      className={`rounded-[22px] border ${
        data.warn ? "border-stale/40 bg-[rgba(255,69,58,0.06)]" : "border-white/12 bg-white/[0.045]"
      }`}
      style={{ width: data.width, height: data.height }}
    >
      <p className={`px-4 pt-2.5 text-[13px] font-semibold ${data.warn ? "text-[#ffb4ae]" : "text-white/85"}`}>
        {data.label}
      </p>
    </div>
  );
}

export const NODE_TYPES = {
  person: PersonNode,
  service: ServiceNode,
  document: DocumentNode,
  team: TeamNode,
};
