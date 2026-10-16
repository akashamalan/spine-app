"use client";

import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "../../lib/useSpine";
import { apiFetch } from "../../lib/identity";
import { avatarStyle, initials } from "../../lib/people";
import type { SGNode } from "../../components/graph/model";
import { useActions } from "../context/actions";
import { useContextMenu } from "../context/ContextMenuProvider";
import { useMenus } from "../context/menus";

type Entity = { id: string; type: string; name: string; created_at: number | null; tier: string | null };
type Person = {
  id: string;
  name: string;
  role: string | null;
  team: string | null;
  has_left: boolean;
  left_at: number | null;
  owns: { id: string; name: string }[];
};

type Kind = "people" | "services" | "documents" | "teams";
const KINDS: { id: Kind; label: string }[] = [
  { id: "people", label: "People" },
  { id: "services", label: "Services" },
  { id: "documents", label: "Documents" },
  { id: "teams", label: "Teams" },
];

const DAY = 86400;
const monthYear = (epoch: number) =>
  new Date(epoch * 1000).toLocaleDateString([], { month: "short", year: "numeric" });

function ageOf(epoch: number | null): { text: string; tone: "ok" | "amber" | "red" } | null {
  if (!epoch) return null;
  const days = Math.max(0, (Date.now() / 1000 - epoch) / DAY);
  const text =
    days < 14
      ? `${Math.round(days)} days old`
      : days < 60
        ? `${Math.round(days / 7)} weeks old`
        : days < 700
          ? `${Math.round(days / 30.44)} months old`
          : `${(days / 365).toFixed(1)} years old`;
  return { text, tone: days > 365 ? "red" : days > 180 ? "amber" : "ok" };
}

const PILL = {
  ok: "bg-white/10 text-white/75",
  amber: "bg-aging/20 text-aging",
  red: "bg-stale/20 text-stale",
} as const;

type Row = {
  id: string;
  kind: Kind;
  title: string;
  sub: string;
  pill?: { text: string; tone: keyof typeof PILL };
  dot?: "good" | "bad";
  avatar?: boolean;
  node: SGNode;
  detail: string[];
  question: string;
};

/** Everyone and everything SPINE knows about, to look up and jump from. */
export function Directory({ refreshKey }: { refreshKey: unknown }) {
  const a = useActions();
  const menus = useMenus();
  const { openMenu } = useContextMenu();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [kind, setKind] = useState<Kind>("people");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch(`${API_BASE}/api/people`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("people")))),
      apiFetch(`${API_BASE}/api/entities`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("entities")))),
    ])
      .then(([p, e]: [{ people: Person[] }, { entities: Entity[] }]) => {
        if (cancelled) return;
        setPeople(p.people);
        setEntities(e.entities);
        setFailed(false);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const rows = useMemo<Record<Kind, Row[]>>(() => {
    const out: Record<Kind, Row[]> = { people: [], services: [], documents: [], teams: [] };
    if (!people || !entities) return out;

    // Who currently owns each service, from the people who left being excluded.
    const owners = new Map<string, string[]>();
    for (const p of people) {
      if (p.has_left) continue;
      for (const o of p.owns) owners.set(o.id, [...(owners.get(o.id) ?? []), p.name]);
    }

    for (const p of people) {
      const left = p.has_left;
      out.people.push({
        id: p.id,
        kind: "people",
        title: p.name,
        sub: [p.role, p.team].filter(Boolean).join(" · "),
        avatar: true,
        pill: left ? { text: p.left_at ? `Left in ${monthYear(p.left_at)}` : "Left", tone: "amber" } : undefined,
        node: { id: p.id, type: "person", label: p.name, left },
        detail: left
          ? ["Has left the company, so owns nothing now."]
          : [p.owns.length ? `Owns ${p.owns.map((o) => o.name).join(", ")}.` : "Doesn't own anything in their own right."],
        question: left ? `Who took over from ${p.name}?` : `What does ${p.name} own?`,
      });
    }

    for (const e of entities) {
      if (e.type === "System") {
        const who = owners.get(e.id) ?? [];
        out.services.push({
          id: e.id,
          kind: "services",
          title: e.name,
          sub: who.length ? `Owner: ${who.join(", ")}` : "Nobody owns it",
          dot: who.length >= 2 ? "good" : "bad",
          pill: e.tier ? { text: `${e.tier} service`, tone: "ok" } : undefined,
          node: { id: e.id, type: "service", label: e.name },
          detail: [
            who.length === 0
              ? "Nobody looks after this."
              : who.length === 1
                ? `Only ${who[0]} looks after this, so if they are away nobody else can help.`
                : `Looked after by ${who.join(" and ")}.`,
          ],
          question: `Who owns ${e.name}?`,
        });
      } else if (e.type === "Document") {
        const age = ageOf(e.created_at);
        out.documents.push({
          id: e.id,
          kind: "documents",
          title: e.name,
          sub: e.created_at ? `Written ${monthYear(e.created_at)}` : "Date unknown",
          pill: age ? { text: age.text, tone: age.tone } : undefined,
          node: {
            id: e.id,
            type: "document",
            label: e.name,
            asserted_at: e.created_at ? new Date(e.created_at * 1000).toISOString().slice(0, 10) : null,
          },
          detail: [age ? `This document is ${age.text}.` : "SPINE doesn't know when this was written."],
          question: `Does any document disagree with "${e.name}"?`,
        });
      } else if (e.type === "Team") {
        const members = people.filter((p) => p.team === e.name && !p.has_left);
        out.teams.push({
          id: e.id,
          kind: "teams",
          title: e.name,
          sub: `${members.length} ${members.length === 1 ? "person" : "people"}`,
          node: { id: e.id, type: "team", label: e.name },
          detail: [members.length ? `${members.map((m) => m.name).join(", ")}.` : "Nobody is on this team right now."],
          question: `Who is on the ${e.name} team?`,
        });
      }
    }
    for (const k of Object.keys(out) as Kind[]) out[k].sort((x, y) => x.title.localeCompare(y.title));
    return out;
  }, [people, entities]);

  const needle = q.trim().toLowerCase();
  const shown = rows[kind].filter((r) => !needle || `${r.title} ${r.sub}`.toLowerCase().includes(needle));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-4 pt-1">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search people, services, documents, teams"
        aria-label="Search the directory"
        className="glass-thin w-full rounded-full px-4 py-2 text-[15px] text-white outline-none placeholder:text-white/55 focus-visible:outline-2 focus-visible:outline-white"
      />
      <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={kind === k.id}
            onClick={() => {
              setKind(k.id);
              setOpen(null);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-white ${
              kind === k.id ? "bg-white/20 text-white" : "bg-white/[0.07] text-white/85 hover:bg-white/[0.12]"
            }`}
          >
            {k.label}
            <span className="tabular-nums font-semibold">{rows[k.id].length}</span>
          </button>
        ))}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {failed && <li className="px-2 py-6 text-[15px] text-white/75">The directory isn&apos;t available right now.</li>}
        {!failed && !people && <li className="px-2 py-6 text-[15px] text-white/70">Loading…</li>}
        {people && shown.length === 0 && (
          <li className="px-2 py-6 text-[15px] text-white/70">Nothing matches that.</li>
        )}
        {shown.map((r) => (
          <li key={r.id} className="mb-1">
            <button
              type="button"
              aria-expanded={open === r.id}
              onClick={() => setOpen(open === r.id ? null : r.id)}
              onContextMenu={(e) => menus && openMenu(e, menus.node(r.node, { x: e.clientX, y: e.clientY }))}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-white ${
                open === r.id ? "bg-white/[0.14]" : "hover:bg-white/[0.07]"
              }`}
            >
              {r.avatar ? (
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-semibold"
                  style={avatarStyle(r.title)}
                >
                  {initials(r.title)}
                </span>
              ) : (
                r.dot && (
                  <span
                    aria-hidden
                    title={r.dot === "bad" ? "Fewer than two owners" : "More than one owner"}
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.dot === "bad" ? "bg-stale" : "bg-fresh"}`}
                  />
                )
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{r.title}</span>
                <span className="block truncate text-[13px] text-white/65">{r.sub}</span>
              </span>
              {r.pill && (
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] ${PILL[r.pill.tone]}`}>{r.pill.text}</span>
              )}
            </button>
            {open === r.id && (
              <div className="mx-1 mb-1 mt-1 rounded-2xl bg-white/[0.06] p-3.5">
                {r.detail.map((d) => (
                  <p key={d} className="text-[15px] leading-snug text-white/90">
                    {d}
                  </p>
                ))}
                {a && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => a.highlight(r.id)}
                      className="rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-medium hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
                    >
                      Show on the graph
                    </button>
                    <button
                      type="button"
                      onClick={() => a.askSpine(r.question, { source: "directory" })}
                      className="rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-medium hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
                    >
                      Ask about it
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
