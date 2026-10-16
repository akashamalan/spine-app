"use client";

import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { HopEvent, HopResult } from "../page";

const HOP_ICONS: Record<string, string> = {
  entry_points: "🔍",
  findings: "🚨",
  who_knows: "👤",
  broken_path: "🕳",
  neighbours: "🔗",
  blast_radius: "💥",
  path_between: "🛤",
  decision_chain: "📜",
};

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function slug(s: string): string {
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return cleaned || `n-${Math.random().toString(36).slice(2)}`;
}

/** First present string-ish value for the given keys. */
function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

function resultNodeKey(result: HopResult, hopIndex: number, j: number): string {
  if (typeof result === "string") return slug(`str-${result}`);
  if (result && typeof result === "object") {
    const raw = pick(result, [
      "target_id", "id", "finding_id", "system", "name", "title",
    ]);
    if (raw) return slug(raw);
  }
  return `res-${hopIndex}-${j}`;
}

function resultLabel(result: HopResult): string {
  if (typeof result === "string") return result;
  const name = result
    ? pick(result, ["name", "title", "system", "text"])
    : null;
  return name ?? JSON.stringify(result);
}

function isFindingResult(hop: HopEvent, result: HopResult): boolean {
  if (hop.tool === "findings") return true;
  if (!result || typeof result !== "object") return false;
  return Boolean(result.finding_id || result.severity);
}

// Truncate to ~2 lines worth of text for the on-node label; the untruncated
// string is kept separately (fullLabel) for the hover tooltip.
function truncateLabel(label: string, maxLen = 34): { display: string; truncated: boolean } {
  const trimmed = label.trim();
  if (trimmed.length <= maxLen) return { display: trimmed, truncated: false };
  return { display: `${trimmed.slice(0, maxLen - 1).trimEnd()}…`, truncated: true };
}

export function StagePanel({
  hops,
  isAsking,
}: {
  hops: HopEvent[];
  isAsking: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cyContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const processedHopsRef = useRef(0);
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [hops]);

  // Initialize the Cytoscape graph once.
  useEffect(() => {
    if (!cyContainerRef.current) return;

    const accent = cssVar("--primary", "#0071E3");
    const resultBg = cssVar("--graph-result-bg", "#DDEBFF");
    const ink = cssVar("--ink", "#14161C");
    const signal = cssVar("--signal", "#A33318");
    const flaggedBg = cssVar("--graph-flagged-bg", "#FFE1DF");
    const warn = cssVar("--warn", "#7A5600");
    const hopBg = cssVar("--graph-hop-bg", "#FFF1DC");

    const cy = cytoscape({
      container: cyContainerRef.current,
      elements: [],
      style: [
        {
          selector: "node",
          style: {
            width: 46,
            height: 46,
            "border-width": 2.5,
            label: "data(label)",
            color: ink,
            "font-size": 9,
            "font-weight": 600,
            "text-wrap": "wrap",
            "text-max-width": "70px",
            "text-valign": "bottom",
            "text-margin-y": 8,
            "text-background-color": "#ffffff",
            "text-background-opacity": 0,
          } as unknown as cytoscape.Css.Node,
        },
        // Step/hop nodes — the walk's own trail markers
        {
          selector: 'node[kind = "hop"]',
          style: {
            shape: "round-rectangle",
            "background-color": hopBg,
            "border-color": warn,
          },
        },
        // Result/claim nodes — data surfaced by a hop
        {
          selector: 'node[kind = "result"]',
          style: {
            shape: "ellipse",
            "background-color": resultBg,
            "border-color": accent,
          },
        },
        // Flagged/finding nodes — always red, overrides kind coloring
        {
          selector: "node[?flagged]",
          style: {
            width: 52,
            height: 52,
            "background-color": flaggedBg,
            "border-color": signal,
            "border-width": 4,
            "z-index": 10,
          } as unknown as cytoscape.Css.Node,
        },
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": accent,
            "target-arrow-color": accent,
            "target-arrow-shape": "triangle",
            "arrow-scale": 1.1,
            "curve-style": "bezier",
            opacity: 0.9,
          },
        },
        {
          selector: ".entering",
          style: { opacity: 0 },
        },
      ],
      layout: { name: "preset" },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      autoungrabify: true,
      minZoom: 0.3,
      maxZoom: 2.5,
    });

    cyRef.current = cy;

    // Hover tooltip — only for nodes whose on-canvas label was truncated.
    cy.on("mouseover", "node", (evt) => {
      const node = evt.target;
      if (!node.data("truncated")) return;
      const tip = tooltipRef.current;
      if (!tip) return;
      tip.textContent = node.data("fullLabel") || node.data("label");
      const pos = node.renderedPosition();
      const h = node.renderedHeight();
      tip.style.left = `${pos.x}px`;
      tip.style.top = `${pos.y - h / 2 - 10}px`;
      tip.style.display = "block";
    });
    cy.on("mouseout", "node", () => {
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
    });
    cy.on("pan zoom drag", () => {
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Feed new hops into the graph as they arrive, with fade + slide animation.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (hops.length === 0) {
      processedHopsRef.current = 0;
      seenIdsRef.current = new Set();
      cy.elements().remove();
      return;
    }

    if (hops.length < processedHopsRef.current) {
      processedHopsRef.current = 0;
      seenIdsRef.current = new Set();
      cy.elements().remove();
    }

    const newHops = hops.slice(processedHopsRef.current);
    if (newHops.length === 0) return;

    const toAdd: cytoscape.ElementDefinition[] = [];
    const enteringIds: string[] = [];
    const seen = seenIdsRef.current;

    newHops.forEach((hop, offset) => {
      const hopIndex = processedHopsRef.current + offset;
      const hopId = `hop-${hopIndex}`;
      const hopLabelRaw = hop.description || hop.tool || hop.action || `Hop ${hopIndex + 1}`;
      const { display: hopLabel, truncated: hopTruncated } = truncateLabel(hopLabelRaw);

      if (!seen.has(hopId)) {
        toAdd.push({
          data: {
            id: hopId,
            label: hopLabel,
            fullLabel: hopLabelRaw,
            truncated: hopTruncated,
            kind: "hop",
            flagged: hop.tool === "findings",
          },
          classes: "entering",
        });
        enteringIds.push(hopId);
        seen.add(hopId);

        if (hopIndex > 0) {
          const prevHopId = `hop-${hopIndex - 1}`;
          const edgeId = `e-${prevHopId}-${hopId}`;
          if (!seen.has(edgeId)) {
            toAdd.push({
              data: { id: edgeId, source: prevHopId, target: hopId },
              classes: "entering",
            });
            seen.add(edgeId);
          }
        }
      }

      const results = hop.results || [];
      results.slice(0, 8).forEach((r: HopResult, j: number) => {
        const key = resultNodeKey(r, hopIndex, j);
        const labelRaw = resultLabel(r);
        const { display: label, truncated } = truncateLabel(labelRaw);
        const flagged = isFindingResult(hop, r);

        if (!seen.has(key)) {
          toAdd.push({
            data: {
              id: key,
              label,
              fullLabel: labelRaw,
              truncated,
              kind: "result",
              flagged,
            },
            classes: "entering",
          });
          enteringIds.push(key);
          seen.add(key);
        }

        const edgeId = `e-${hopId}-${key}`;
        if (!seen.has(edgeId)) {
          toAdd.push({
            data: { id: edgeId, source: hopId, target: key },
            classes: "entering",
          });
          seen.add(edgeId);
        }
      });
    });

    processedHopsRef.current = hops.length;

    if (toAdd.length === 0) return;

    cy.add(toAdd);

    // 'cose' spreads nodes out in 2D (force-directed) instead of stacking
    // them in a straight vertical line.
    const layout = cy.layout({
      name: "cose",
      animate: true,
      animationDuration: 600,
      animationEasing: "ease-out-cubic",
      padding: 30,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 90,
      edgeElasticity: () => 100,
      gravity: 1,
      numIter: 1000,
      nodeDimensionsIncludeLabels: true,
      randomize: true,
      fit: true,
    } as unknown as cytoscape.LayoutOptions);

    // Reveal newly-added elements with a fade, once the layout finishes.
    // Animated layouts (and cytoscape's own .animate() tweens) run on
    // requestAnimationFrame, which browsers throttle or fully suspend for a
    // backgrounded/non-visible tab — so neither 'layoutstop' nor the tween
    // is guaranteed to fire. The timeout fallback below does a synchronous,
    // non-animated reveal that doesn't depend on rAF at all, guaranteeing
    // nodes become visible either way.
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      enteringIds.forEach((id) => {
        const ele = cy.getElementById(id);
        if (ele && ele.length) {
          ele.animate(
            { style: { opacity: 1 } },
            {
              duration: 350,
              easing: "ease-out",
              complete: () => ele.removeClass("entering"),
            }
          );
        }
      });
    };
    const revealInstant = () => {
      if (revealed) return;
      revealed = true;
      enteringIds.forEach((id) => {
        const ele = cy.getElementById(id);
        if (ele && ele.length) ele.removeClass("entering");
      });
    };

    layout.one("layoutstop", reveal);
    const revealFallback = setTimeout(revealInstant, 1200);
    layout.one("layoutstop", () => clearTimeout(revealFallback));

    layout.run();
  }, [hops]);

  const isIdle = hops.length === 0 && !isAsking;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Graph visualization — always mounted so Cytoscape attaches on first
          render; grows live as hops stream in. */}
      <div
        className="relative shrink-0 border-b border-rule bg-sunk/30 overflow-hidden"
        style={{ height: "50%" }}
      >
        <div ref={cyContainerRef} className="h-full w-full" />

        {/* Hover tooltip for truncated labels */}
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-20 hidden -translate-x-1/2 -translate-y-full whitespace-normal rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-paper shadow-lg"
          style={{ maxWidth: 220, display: "none" }}
        />

        {/* Legend */}
        <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-3 rounded-md bg-slab/80 px-2 py-1 text-[9px] text-ink-faint backdrop-blur-sm">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-warn-soft border border-warn" />
            Step
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent-soft border border-primary" />
            Result
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-signal-soft border-2 border-signal" />
            Flagged
          </span>
        </div>
      </div>

      {/* Hop log */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
        {isIdle ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-sm">
              <div className="text-4xl mb-3 opacity-30">🦴</div>
              <p className="text-sm text-ink-faint">
                Ask a question to watch SPINE walk the graph
              </p>
              <p className="text-xs text-ink-faint mt-2">
                Each hop reveals how knowledge connects — and where it breaks
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {hops.map((hop, i) => (
              <div key={i} className="animate-hop">
                <HopCard hop={hop} index={i} />
              </div>
            ))}

            {isAsking && (
              <div className="flex items-center gap-2 text-primary text-sm animate-pulse">
                <span className="inline-block w-2 h-2 rounded-full bg-primary" />
                Walking the graph...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HopCard({ hop, index }: { hop: HopEvent; index: number }) {
  const icon = HOP_ICONS[hop.tool || ""] || "📌";
  const resultCount = hop.results?.length || 0;

  return (
    <div className="bg-slab border border-rule rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-rule bg-sunk/50">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
          Hop {typeof hop.hop === "number" ? hop.hop : index + 1}
        </span>
        <span className="text-xs text-ink-faint">
          {hop.description || hop.action}
        </span>
        {resultCount > 0 && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-accent-soft text-primary font-mono">
            {resultCount} result{resultCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Cypher query (collapsed by default via details) */}
      {hop.cypher && (
        <details className="border-b border-rule">
          <summary className="px-3 py-1.5 text-[10px] text-ink-faint cursor-pointer hover:text-ink-soft">
            Show Cypher
          </summary>
          <pre className="px-3 pb-2 text-[11px] font-mono text-primary overflow-x-auto">
            {hop.cypher}
          </pre>
        </details>
      )}

      {/* Results */}
      {hop.results && hop.results.length > 0 && (
        <div className="px-3 py-2 space-y-1.5">
          {hop.results.slice(0, 5).map((r: HopResult, j: number) => (
            <ResultRow key={j} result={r} />
          ))}
          {hop.results.length > 5 && (
            <p className="text-[10px] text-ink-faint">
              +{hop.results.length - 5} more
            </p>
          )}
        </div>
      )}

      {/* Ownership status (broken_path special) */}
      {hop.ownership_status && (
        <div className="px-3 py-2">
          <OwnershipBadge status={hop.ownership_status} gap={hop.has_gap ?? false} explanation={hop.gap_explanation} />
        </div>
      )}
    </div>
  );
}

function ResultRow({ result }: { result: HopResult }) {
  if (typeof result === "string") {
    return <p className="text-xs text-ink-soft">{result}</p>;
  }

  const name =
    pick(result, ["name", "title", "text", "system"]) ??
    JSON.stringify(result).slice(0, 80);
  const rawConfidence = result.confidence;
  const confidence =
    typeof rawConfidence === "number" ? rawConfidence : undefined;
  const kind = pick(result, ["kind", "type", "label"]);

  return (
    <div className="flex items-center gap-2 text-xs">
      {kind && (
        <span className="text-[10px] font-mono text-ink-faint px-1 py-0.5 bg-sunk rounded">
          {kind}
        </span>
      )}
      <span className="text-ink-soft truncate">{name}</span>
      {confidence !== undefined && <ConfidenceBar value={confidence} />}
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "bg-good" : pct >= 60 ? "bg-warn" : "bg-signal";

  return (
    <div className="flex items-center gap-1 ml-auto shrink-0">
      <div className="w-12 h-1.5 bg-sunk rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-[10px] font-mono ${
          pct < 60 ? "text-signal" : "text-ink-faint"
        }`}
      >
        {pct}%
      </span>
    </div>
  );
}

function OwnershipBadge({
  status,
  gap,
  explanation,
}: {
  status: string;
  gap: boolean;
  explanation?: string;
}) {
  const isOk = status === "owner_active" && !gap;
  const color = isOk ? "text-good" : "text-signal";
  const bg = isOk ? "bg-good-soft" : "bg-signal-soft";
  const icon = isOk ? "✓" : "🕳";
  const label =
    status === "no_owner_edge"
      ? "No owner found"
      : status === "owner_expired"
        ? "Owner expired"
        : status === "owner_inactive"
          ? "Owner left the company"
          : gap
            ? "Ownership gap detected"
            : "Owner active";

  return (
    <div className={`flex items-start gap-2 px-2.5 py-2 rounded-md ${bg}`}>
      <span className="text-sm">{icon}</span>
      <div>
        <p className={`text-xs font-semibold ${color}`}>{label}</p>
        {explanation && (
          <p className="text-[11px] text-ink-soft mt-0.5">{explanation}</p>
        )}
      </div>
    </div>
  );
}
