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

// Service pills were sized for a roomy panel; the idle map now has to fit
// 4+ team islands in a short, wide strip, so every one of these is tighter
// than the question-graph's own full-size nodes.
export const CHIP_W = 96;
export const CHIP_H = 26;
const CHIP_GAP = 6;
/** People are round initials avatars now, not pills — far smaller per head. */
export const AVATAR = 36;
const AVATAR_GAP = 6;
const AVATAR_CELL = AVATAR + AVATAR_GAP;
const BLOCK_GAP = 6; // between the avatar grid and the service list
const PAD = 8;
const HEADER = 20;
const ISLAND_GAP = 8;

/**
 * People sit inside their team's island as a small grid of avatars; services
 * owned by that team list below as pills. Islands shelf-pack across both
 * axes so the whole company fits the panel without shrinking past legibility.
 */
export function companyMap(nodes: SGNode[], edges: SGEdge[], size: Size): MapLayout {
  const people = nodes.filter((n) => n.type === "person");
  const services = nodes.filter((n) => n.type === "service");
  const teams = nodes.filter((n) => n.type === "team");
  const teamOf = new Map(people.map((p) => [p.id, p.team_id ?? null]));

  type Group = { id: string; label: string; people: string[]; services: string[]; warn?: boolean };
  const groups = new Map<string, Group>(
    teams
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((t) => [t.id, { id: t.id, label: t.label, people: [], services: [] }])
  );
  const noTeam: Group = { id: "island-no-team", label: "No team", people: [], services: [] };
  const unowned: Group = {
    id: "island-unowned",
    label: "Nobody looks after these",
    people: [],
    services: [],
    warn: true,
  };

  // Current people first, then those who left, each alphabetically.
  for (const p of people.slice().sort((a, b) => Number(Boolean(a.left)) - Number(Boolean(b.left)) || a.label.localeCompare(b.label))) {
    (groups.get(p.team_id ?? "") ?? noTeam).people.push(p.id);
  }
  for (const s of services.slice().sort((a, b) => a.label.localeCompare(b.label))) {
    const votes = new Map<string, number>();
    for (const e of edges) {
      if (e.type !== "OWNS" || e.target !== s.id || e.superseded) continue;
      const t = teamOf.get(e.source);
      if (t) votes.set(t, (votes.get(t) ?? 0) + 1);
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    (best ? groups.get(best) ?? noTeam : unowned).services.push(s.id);
  }

  const all = [...groups.values(), noTeam, unowned].filter((g) => g.people.length + g.services.length > 0);
  const usableW = Math.max(CHIP_W + PAD * 2, size.width - 24);

  // Size each island: avatars form a roughly-square grid on top, service
  // pills stack in a single column underneath (rarely more than a handful
  // per team, so one column reads better than wrapping).
  // The panel is wide and short, so each island is biased to use width
  // (plentiful) rather than height (the scarce axis): people sit in one
  // row until there are more than fit comfortably, services likewise.
  const sized = all.map((g) => {
    const avatarCols = g.people.length ? Math.min(g.people.length, 10) : 0;
    const avatarRows = g.people.length ? Math.ceil(g.people.length / avatarCols) : 0;
    const avatarBlockW = g.people.length ? avatarCols * AVATAR_CELL - AVATAR_GAP : 0;
    const avatarBlockH = g.people.length ? avatarRows * AVATAR_CELL - AVATAR_GAP : 0;

    // One row of services per island, same bias as avatars: rows are the
    // scarce resource (the panel is short), columns are cheap (it is wide).
    // Only wrap once a team has more services than fit comfortably in a row.
    const svcCols = g.services.length === 0 ? 0 : g.services.length <= 5 ? g.services.length : Math.ceil(g.services.length / 2);
    const svcRows = g.services.length ? Math.ceil(g.services.length / svcCols) : 0;
    const svcBlockW = g.services.length ? svcCols * CHIP_W + (svcCols - 1) * CHIP_GAP : 0;
    const svcBlockH = g.services.length ? svcRows * CHIP_H + (svcRows - 1) * CHIP_GAP : 0;

    const gap = g.people.length && g.services.length ? BLOCK_GAP : 0;
    const contentW = Math.max(avatarBlockW, svcBlockW);
    const contentH = avatarBlockH + gap + svcBlockH;

    // The island must be at least as wide as its own label, or a short
    // "Nobody looks after these"-style name wraps across several lines.
    // ~7.5px/char at the 15px label size, roughly (real glyph widths vary,
    // but this only needs to be in the right neighbourhood).
    const labelW = g.label.length * 7.5 + PAD * 2;

    return {
      g,
      avatarCols,
      svcCols,
      avatarBlockW,
      svcBlockW,
      avatarBlockH,
      width: Math.max(contentW + PAD * 2, labelW),
      height: HEADER + contentH + PAD * 2,
    };
  });

  // Shelf-pack islands left to right, wrapping to a new row of islands once
  // the panel's width runs out, so the whole map stays close to the panel's
  // own shape instead of one wide strip that forces a tiny fit-to-width zoom.
  const positions: Positions = new Map();
  const islands: Island[] = [];
  let x = 0;
  let y = 0;
  let shelfH = 0;
  for (const s of sized) {
    if (x > 0 && x + s.width > usableW) {
      x = 0;
      y += shelfH + ISLAND_GAP;
      shelfH = 0;
    }
    islands.push({ id: s.g.id, label: s.g.label, x, y, width: s.width, height: s.height, warn: s.g.warn });

    const contentW = s.width - PAD * 2;
    const avatarX = x + PAD + (contentW - s.avatarBlockW) / 2;
    s.g.people.forEach((id, i) => {
      const col = i % s.avatarCols;
      const row = Math.floor(i / s.avatarCols);
      positions.set(id, {
        x: avatarX + col * AVATAR_CELL + AVATAR / 2,
        y: y + HEADER + PAD + row * AVATAR_CELL + AVATAR / 2,
      });
    });

    const svcY = y + HEADER + PAD + s.avatarBlockH + (s.g.people.length && s.g.services.length ? BLOCK_GAP : 0);
    const svcX = x + PAD + (contentW - s.svcBlockW) / 2;
    s.g.services.forEach((id, i) => {
      const col = i % s.svcCols;
      const row = Math.floor(i / s.svcCols);
      positions.set(id, {
        x: svcX + col * (CHIP_W + CHIP_GAP) + CHIP_W / 2,
        y: svcY + row * (CHIP_H + CHIP_GAP) + CHIP_H / 2,
      });
    });

    x += s.width + ISLAND_GAP;
    shelfH = Math.max(shelfH, s.height);
  }
  return { positions, islands };
}
