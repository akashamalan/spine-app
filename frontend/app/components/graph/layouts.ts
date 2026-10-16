/**
 * Deterministic layouts. Same input → same picture, every time: that is what
 * makes the graph look deliberate. Positions are node CENTRES (the flow uses
 * nodeOrigin [0.5, 0.5]); the camera's fitView does the final scaling.
 */
import type { MEdge, MNode, SGEdge, SGNode } from "./model";

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type Positions = Map<string, Point>;

const TYPE_ORDER: Record<string, number> = { person: 0, service: 1, team: 2, document: 3 };

function byTypeThenOrder(a: MNode, b: MNode): number {
  return (
    (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) ||
    Number(Boolean(a.left)) - Number(Boolean(b.left)) ||
    a.step - b.step ||
    a.label.localeCompare(b.label)
  );
}

/** Even spacing on an ellipse, starting at 12 o'clock (or offset for 2). */
function ring(ids: string[], cx: number, cy: number, rx: number, ry: number, out: Positions) {
  const n = ids.length;
  const start = n === 2 ? Math.PI : -Math.PI / 2;
  ids.forEach((id, i) => {
    const a = start + (2 * Math.PI * i) / n;
    out.set(id, { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  });
}

/** The panel's shape, never flatter than 2.6:1 nor taller than square. */
function frame(size: Size) {
  const w = Math.max(320, size.width);
  const h = Math.max(200, Math.min(size.height, w));
  return { w, h, cx: w / 2, cy: h / 2 };
}

// ── Ego: who is around the thing you asked about ─────────────────────────

export function egoLayout(nodes: MNode[], focusId: string | null, size: Size): Positions {
  const { w, h, cx, cy } = frame(size);
  const out: Positions = new Map();
  const focus = nodes.find((n) => n.id === focusId) ?? nodes[0];
  if (!focus) return out;
  out.set(focus.id, { x: cx, y: cy });

  const rest = nodes.filter((n) => n.id !== focus.id).sort(byTypeThenOrder);
  let inner = rest.filter((n) => n.type === "person");
  let outer = rest.filter((n) => n.type !== "person");
  if (inner.length === 0) [inner, outer] = [outer, []];

  ring(inner.map((n) => n.id), cx, cy, w * 0.24, h * 0.3, out);
  ring(outer.map((n) => n.id), cx, cy, w * 0.43, h * 0.46, out);
  return out;
}

// ── Blast radius: rings by distance ──────────────────────────────────────

function hopDistances(focusId: string, edges: SGEdge[]): Map<string, number> {
  const dist = new Map([[focusId, 0]]);
  let frontier = [focusId];
  while (frontier.length) {
    const next: string[] = [];
    for (const e of edges) {
      for (const [a, b] of [
        [e.source, e.target],
        [e.target, e.source],
      ]) {
        if (frontier.includes(a) && !dist.has(b)) {
          dist.set(b, (dist.get(a) ?? 0) + 1);
          next.push(b);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

export function blastLayout(nodes: MNode[], edges: MEdge[], focusId: string | null, size: Size): Positions {
  const { w, h, cx, cy } = frame(size);
  const out: Positions = new Map();
  const focus = nodes.find((n) => n.id === focusId) ?? nodes[0];
  if (!focus) return out;
  out.set(focus.id, { x: cx, y: cy });

  const walked = hopDistances(focus.id, edges.filter((e) => e.type === "DEPENDS_ON"));
  const anyHop = hopDistances(focus.id, edges);
  const ringOf = (n: MNode) => n.depth ?? walked.get(n.id) ?? anyHop.get(n.id) ?? 99;

  const rest = nodes.filter((n) => n.id !== focus.id);
  const depths = [...new Set(rest.map(ringOf))].sort((a, b) => a - b);
  // Gaps in ring numbers close up; unreachable things take the outermost ring.
  const rings = depths.length;
  const stepX = (w * 0.46) / Math.max(1, rings);
  const stepY = (h * 0.46) / Math.max(1, rings);
  depths.forEach((d, i) => {
    const members = rest.filter((n) => ringOf(n) === d).sort(byTypeThenOrder);
    ring(members.map((n) => n.id), cx, cy, stepX * (i + 1), stepY * (i + 1), out);
  });
  return out;
}

// ── Path: a subway line in the order SPINE walked ─────────────────────────

export function pathLayout(nodes: MNode[], edges: MEdge[], focusId: string | null, size: Size): Positions {
  const { w, h } = frame(size);
  const out: Positions = new Map();
  if (nodes.length === 0) return out;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const focus = byId.get(focusId ?? "") ?? nodes[0];

  // Stops: the focus, then everything reachable over walked edges, in step order.
  const adj = (id: string, onPath: boolean) =>
    edges
      .filter((e) => (!onPath || e.on_path) && (e.source === id || e.target === id))
      .map((e) => (e.source === id ? e.target : e.source))
      .filter((x) => byId.has(x));
  const stops = [focus.id];
  for (let i = 0; i < stops.length; i++) {
    const next = adj(stops[i], true)
      .filter((x) => !stops.includes(x))
      .sort((a, b) => byId.get(a)!.step - byId.get(b)!.step);
    stops.push(...next);
  }
  const shownStops = stops.slice(0, 7);

  const gapX = Math.max(170, (w * 0.9) / Math.max(1, shownStops.length - 1 || 1));
  const lineY = h * 0.22;
  shownStops.forEach((id, i) => out.set(id, { x: i * gapX, y: lineY }));

  // Side branches drop below the stop they hang off.
  const rest = nodes.filter((n) => !out.has(n.id)).sort(byTypeThenOrder);
  const under = new Map<string, string[]>();
  const loose: string[] = [];
  for (const n of rest) {
    const stop = adj(n.id, false).find((x) => shownStops.includes(x));
    if (stop) under.set(stop, [...(under.get(stop) ?? []), n.id]);
    else loose.push(n.id);
  }
  const rowH = 78;
  let deepest = lineY;
  for (const [stop, ids] of under) {
    const base = out.get(stop)!;
    const cols = Math.min(ids.length, ids.length > 6 ? 3 : 2);
    ids.forEach((id, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = base.x + (col - (cols - 1) / 2) * 165;
      const y = base.y + 105 + row * rowH;
      out.set(id, { x, y });
      deepest = Math.max(deepest, y);
    });
  }
  // Things the search found that don't touch the line: a quiet row underneath.
  const perRow = Math.max(3, shownStops.length);
  loose.forEach((id, i) => {
    out.set(id, { x: (i % perRow) * gapX, y: deepest + 110 + Math.floor(i / perRow) * rowH });
  });
  return out;
}

// ── Company map: team islands ─────────────────────────────────────────────

export type Island = {
  id: string;
  label: string;
  x: number; // top-left
  y: number;
  width: number;
  height: number;
  warn?: boolean;
};

export type MapLayout = { positions: Positions; islands: Island[] };

export const CHIP_W = 158;
export const CHIP_H = 34;
const CHIP_GAP = 8;
const PAD = 14;
const HEADER = 30;
const ISLAND_GAP = 18;

/**
 * People sit inside their team's island; each service sits in the island of
 * the team most of its current owners belong to. Islands fill columns top
 * to bottom so the whole company fits the panel's height.
 */
export function companyMap(nodes: SGNode[], edges: SGEdge[], size: Size): MapLayout {
  const people = nodes.filter((n) => n.type === "person");
  const services = nodes.filter((n) => n.type === "service");
  const teams = nodes.filter((n) => n.type === "team");
  const teamOf = new Map(people.map((p) => [p.id, p.team_id ?? null]));

  type Group = { id: string; label: string; items: string[]; warn?: boolean };
  const groups = new Map<string, Group>(
    teams
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((t) => [t.id, { id: t.id, label: t.label, items: [] }])
  );
  const noTeam: Group = { id: "island-no-team", label: "No team", items: [] };
  const unowned: Group = { id: "island-unowned", label: "Nobody looks after these", items: [], warn: true };

  // Current people first, then those who left, each alphabetically.
  for (const p of people.slice().sort((a, b) => Number(Boolean(a.left)) - Number(Boolean(b.left)) || a.label.localeCompare(b.label))) {
    (groups.get(p.team_id ?? "") ?? noTeam).items.push(p.id);
  }
  for (const s of services.slice().sort((a, b) => a.label.localeCompare(b.label))) {
    const votes = new Map<string, number>();
    for (const e of edges) {
      if (e.type !== "OWNS" || e.target !== s.id || e.superseded) continue;
      const t = teamOf.get(e.source);
      if (t) votes.set(t, (votes.get(t) ?? 0) + 1);
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    (best ? groups.get(best) ?? noTeam : unowned).items.push(s.id);
  }

  const all = [...groups.values(), noTeam, unowned].filter((g) => g.items.length > 0);
  const usableH = Math.max(CHIP_H * 3, size.height - 24);
  const rowsFit = Math.max(2, Math.floor((usableH - HEADER - PAD * 2 + CHIP_GAP) / (CHIP_H + CHIP_GAP)));

  // Size each island: as few columns as the height allows.
  const sized = all.map((g) => {
    const cols = Math.ceil(g.items.length / rowsFit);
    const rows = Math.ceil(g.items.length / cols);
    return {
      g,
      cols,
      rows,
      width: cols * CHIP_W + (cols - 1) * CHIP_GAP + PAD * 2,
      height: HEADER + rows * CHIP_H + (rows - 1) * CHIP_GAP + PAD * 2,
    };
  });

  // Stack small islands in the same column when they fit.
  const positions: Positions = new Map();
  const islands: Island[] = [];
  let x = 0;
  let colY = 0;
  let colW = 0;
  for (const s of sized) {
    if (colY > 0 && colY + s.height > usableH) {
      x += colW + ISLAND_GAP;
      colY = 0;
      colW = 0;
    }
    islands.push({ id: s.g.id, label: s.g.label, x, y: colY, width: s.width, height: s.height, warn: s.g.warn });
    s.g.items.forEach((id, i) => {
      const col = Math.floor(i / s.rows);
      const row = i % s.rows;
      positions.set(id, {
        x: x + PAD + col * (CHIP_W + CHIP_GAP) + CHIP_W / 2,
        y: colY + HEADER + PAD + row * (CHIP_H + CHIP_GAP) + CHIP_H / 2,
      });
    });
    colY += s.height + ISLAND_GAP;
    colW = Math.max(colW, s.width);
  }
  return { positions, islands };
}
