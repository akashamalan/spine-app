"use client";

import { useMemo } from "react";
import type { Claim } from "../lib/types";
import { CountUp } from "./CountUp";

/** SPINE_GRAPH Part 5 — five live numbers, computed from real data only.
 * A tile that cannot be computed right now (nothing loaded yet) is left out
 * entirely rather than shown as a fake zero. */

type FilterKind = "bus_factor" | "orphan";

type Tile = {
  key: string;
  value: number;
  unit?: string;
  title: string;
  hint: string;
  bar?: number; // 0-100, a tiny progress fill under the tile
  filter?: FilterKind;
};

function TileButton({ tile, active, onToggle }: { tile: Tile; active: boolean; onToggle?: (f: FilterKind) => void }) {
  const clickable = !!tile.filter && !!onToggle;
  const classes = `glass-thin flex flex-col gap-0.5 rounded-xl px-2.5 py-2 text-left transition-colors active:scale-[0.98] ${
    active ? "bg-white/20" : clickable ? "hover:bg-white/[0.12]" : ""
  }`;
  const content = (
    <>
      <span className="text-[17px] font-semibold tabular-nums leading-none text-white">
        <CountUp value={tile.value} />
        {tile.unit}
      </span>
      <span className="text-[13px] leading-tight text-white/75">{tile.title}</span>
      {tile.bar !== undefined && (
        <span aria-hidden className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full rounded-full bg-fresh" style={{ width: `${tile.bar}%` }} />
        </span>
      )}
    </>
  );
  if (clickable) {
    return (
      <button
        type="button"
        title={tile.hint}
        aria-pressed={active}
        onClick={() => onToggle!(tile.filter!)}
        className={classes}
      >
        {content}
      </button>
    );
  }
  return (
    <div title={tile.hint} className={classes}>
      {content}
    </div>
  );
}

export function StatsStrip({
  busFactorCount,
  orphanCount,
  claims,
  resolvedThisWeek,
  activeFilter,
  onToggleFilter,
  columns = 2,
}: {
  busFactorCount: number;
  orphanCount: number;
  claims: Claim[];
  /** Null until the first read lands; distinct from a genuine zero. */
  resolvedThisWeek: number | null;
  activeFilter: FilterKind | null;
  /** Left out where the tiles are only for reading (the Facts window). */
  onToggleFilter?: (f: FilterKind) => void;
  /** Tiles per row: 2 in a narrow panel, 3 where there is room. */
  columns?: 2 | 3;
}) {
  const freshPct = useMemo(() => {
    if (claims.length === 0) return null;
    const fresh = claims.filter((c) => !c.stale).length;
    return Math.round((fresh / claims.length) * 100);
  }, [claims]);

  const avgAgeMonths = useMemo(() => {
    const ages = claims.map((c) => c.age_days).filter((n): n is number => typeof n === "number");
    if (ages.length === 0) return null;
    const avgDays = ages.reduce((a, b) => a + b, 0) / ages.length;
    return Math.round(avgDays / 30.44);
  }, [claims]);

  const tiles: Tile[] = [];

  if (freshPct !== null) {
    tiles.push({
      key: "fresh",
      value: freshPct,
      unit: "%",
      title: "Facts up to date",
      hint: `${freshPct}% of what SPINE knows is fresh.`,
      bar: freshPct,
    });
  }

  tiles.push({
    key: "bus_factor",
    value: busFactorCount,
    title: "Single points of failure",
    hint: `${busFactorCount} ${busFactorCount === 1 ? "thing" : "things"} only one person knows.`,
    filter: "bus_factor",
  });

  tiles.push({
    key: "orphan",
    value: orphanCount,
    title: "Nobody looks after",
    hint: `${orphanCount} ${orphanCount === 1 ? "service has" : "services have"} no owner.`,
    filter: "orphan",
  });

  if (avgAgeMonths !== null) {
    tiles.push({
      key: "age",
      value: avgAgeMonths,
      unit: " mo",
      title: "Average fact age",
      hint: `The average fact SPINE knows is ${avgAgeMonths} ${avgAgeMonths === 1 ? "month" : "months"} old.`,
    });
  }

  if (resolvedThisWeek !== null) {
    tiles.push({
      key: "resolved",
      value: resolvedThisWeek,
      title: "Fixed by people this week",
      hint: `${resolvedThisWeek} ${resolvedThisWeek === 1 ? "answer" : "answers"} to Vera in the last 7 days.`,
    });
  }

  if (tiles.length === 0) return null;

  return (
    <div role="group" aria-label="Live numbers" className={`grid shrink-0 gap-1.5 px-5 pt-4 pb-3 ${columns === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {tiles.map((t) => (
        <TileButton
          key={t.key}
          tile={t}
          active={!!t.filter && activeFilter === t.filter}
          onToggle={onToggleFilter}
        />
      ))}
    </div>
  );
}
