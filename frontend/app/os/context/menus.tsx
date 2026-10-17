"use client";

import { createElement, useMemo, type ReactNode } from "react";
import {
  Copy,
  Eye,
  EyeOff,
  Info,
  Maximize2,
  Minimize2,
  Minus,
  MessageCircleQuestion,
  Network,
  RotateCcw,
  ScanLine,
  Search,
  Sparkles,
  Terminal,
  ThumbsDown,
  X,
  ArrowUpToLine,
} from "lucide-react";
import type { Claim, Finding } from "../../lib/types";
import type { SGNode } from "../../components/graph/model";
import { findingTitle, shortDate, whyItMatters, displayName } from "../../lib/labels";
import { getPrefs, setPrefs, type Wallpaper } from "../../lib/uiPrefs";
import type { WinId } from "../presets";
import { useWindowsMaybe } from "../windowStore";
import { useActions, type Actions } from "./actions";
import { useContextMenu } from "./ContextMenuProvider";
import type { MenuItem } from "./ContextMenu";
import { ConfidenceMath, PersonCard, WhyFlagged } from "./Popovers";

/** Every right-click menu in SPINE, in one place. A menu is just a list of
 * things that already work: ask, copy, filter, navigate, or (with a
 * confirmation first) a write to Layer 3. Nothing here edits a fact. */

type Pt = { x: number; y: number };
const icon = (C: typeof Copy) => createElement(C, { size: 15, "aria-hidden": true });
const sep: MenuItem = { type: "separator" };

function item(
  id: string,
  label: string,
  onSelect: () => void,
  more: Partial<Extract<MenuItem, { type: "item" }>> = {}
): MenuItem {
  return { type: "item", id, label, onSelect, ...more };
}

const ONLY_ADMINS = "Only administrators can do this.";

/** A person's age as plain words, for the document menu. */
function agePhrase(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = Math.max(0, Math.round((Date.now() - t) / 86400000));
  if (days < 1) return "written today";
  if (days < 45) return `${days} ${days === 1 ? "day" : "days"} old`;
  if (days < 700) {
    const m = Math.round(days / 30.44);
    return `${m} ${m === 1 ? "month" : "months"} old`;
  }
  return `${(days / 365).toFixed(1)} years old`;
}

export type Menus = {
  wallpaper: () => MenuItem[];
  titleBar: (id: WinId) => MenuItem[];
  dock: (id: WinId) => MenuItem[];
  node: (n: SGNode, pt: Pt) => MenuItem[];
  canvas: () => MenuItem[];
  finding: (f: Finding, pt: Pt) => MenuItem[];
  answer: (selection: string) => MenuItem[];
  evidence: (claimId: string, text: string, pt: Pt) => MenuItem[];
};

type Env = {
  a: Actions;
  win: ReturnType<typeof useWindowsMaybe>;
  showPopover: (at: Pt, node: ReactNode, title?: string) => void;
};

function build({ a, win, showPopover }: Env): Menus {
  const claimOf = (id: string): Claim | undefined => a.claims.find((c) => c.id === id);
  const wins = (id: WinId) => win?.state.wins[id];

  return {
    wallpaper: () => {
      const mood = getPrefs().wallpaper;
      const set = (w: Wallpaper) => () => setPrefs({ wallpaper: w });
      return [
        item("ask", "Ask a question…", a.focusAsk, { icon: icon(Sparkles) }),
        item("scan", "Scan now", a.scan, { icon: icon(ScanLine), disabled: a.isAdmin ? false : ONLY_ADMINS }),
        sep,
        {
          type: "submenu",
          id: "windows",
          label: "Windows",
          items: [
            item("open-all", "Open all", () => win?.showAll(a.allowed)),
            item("min-all", "Minimize all", () => win?.hideAll(a.allowed)),
            item("tidy", "Tidy", () => win?.tidy()),
          ],
        },
        {
          type: "submenu",
          id: "wallpaper",
          label: "Wallpaper",
          items: (["calm", "normal", "lively"] as Wallpaper[]).map((w) =>
            item(`wp-${w}`, w[0].toUpperCase() + w.slice(1), set(w), { hint: mood === w ? "Now" : undefined })
          ),
        },
        sep,
        item("start", "Getting started", () => a.openWindow("start")),
        item("about", "About SPINE", () => a.openWindow("settings")),
      ];
    },

    titleBar: (id) => {
      const w = wins(id);
      return [
        item("min", "Minimize", () => win?.minimize(id), { icon: icon(Minus) }),
        item("max", w?.maximized ? "Restore" : "Maximize", () => win?.toggleMax(id), {
          icon: icon(w?.maximized ? Minimize2 : Maximize2),
        }),
        item("close", "Close", () => win?.close(id), { icon: icon(X) }),
        sep,
        item("front", "Bring to front", () => win?.focus(id), { icon: icon(ArrowUpToLine) }),
        item("reset", "Reset this window", () => win?.resetOne(id), { icon: icon(RotateCcw) }),
      ];
    },

    dock: (id) => {
      const w = wins(id);
      const open = !!w?.open && !w.minimized;
      const prefs = getPrefs();
      const extras: MenuItem[] =
        id === "vera"
          ? [
              sep,
              item("mine", "Show only my questions", () => setPrefs({ veraOnlyMine: !prefs.veraOnlyMine }), {
                hint: prefs.veraOnlyMine ? "On" : undefined,
              }),
            ]
          : id === "noticed"
            ? [
                sep,
                item("urgent", "Show only urgent", () => setPrefs({ noticedOnlyUrgent: !prefs.noticedOnlyUrgent }), {
                  hint: prefs.noticedOnlyUrgent ? "On" : undefined,
                }),
              ]
            : id === "graph"
              ? [sep, item("fit", "Fit to screen", () => a.graphApi.current?.fit(), { icon: icon(ScanLine), disabled: !w?.open && "Open the graph first." })]
              : [];
      return [
        item("open", open ? "Bring to front" : w?.open ? "Show" : "Open", () => win?.dockActivate(id)),
        item("min", "Minimize", () => win?.minimize(id), { disabled: !open && "It isn't open." }),
        item("close", "Close", () => win?.close(id), { disabled: !w?.open && "It isn't open." }),
        item("reset", "Reset position", () => win?.resetOne(id)),
        ...extras,
      ];
    },

    node: (n, pt) => {
      const name = n.label;
      const common = [
        item("hl", "Highlight on the graph", () => a.highlight(n.id), { icon: icon(Network) }),
        item("copy", n.type === "document" ? "Copy title" : "Copy name", () => a.copy(name, "Name")),
      ];

      if (n.type === "person") {
        // Ownership facts that name them: what Vera could ask about.
        const named = a.claims.filter((c) => c.fact_type === "ownership" && c.text.includes(name));
        return [
          item("card", "Show their card", () => showPopover(pt, createElement(PersonCard, { id: n.id, fallbackName: name }), name)),
          sep,
          ...common,
          ...(a.isAdmin
            ? [
                sep,
                item("vera", "Ask Vera to check with them", () => void a.veraAsk(named.map((c) => c.id), `About ${name}`), {
                  disabled: named.length ? false : "No ownership fact names them.",
                  confirm: `Ask Vera to check ${named.length} ${named.length === 1 ? "fact" : "facts"} naming ${name} with a person? This sends a question; it changes no fact.`,
                  icon: icon(MessageCircleQuestion),
                }),
              ]
            : []),
        ];
      }

      if (n.type === "service") {
        return [
          item("own", "Who owns this?", () => a.askSpine(`Who owns ${name}?`, { source: "graph" })),
          item("dep", "What depends on it?", () => a.askSpine(`What depends on ${name}?`, { source: "graph" })),
          item("blast", "What breaks if it goes down?", () => a.askSpine(`What happens if ${name} goes down?`, { source: "graph" })),
          item("docs", "Show the documents about it", () => a.askSpine(`Which documents are about ${name}?`, { source: "graph" })),
          sep,
          ...common,
        ];
      }

      if (n.type === "document") {
        const age = n.asserted_at ? agePhrase(n.asserted_at) : null;
        return [
          item(
            "age",
            "How old is this?",
            () =>
              a.notify({
                title: name,
                lines: [age ? `This document is ${age} (${n.asserted_at}).` : "SPINE doesn't know when this was written."],
              })
          ),
          item("dis", "Does any document disagree with this?", () => a.askSpine(`Does any document disagree with "${name}"?`, { source: "graph" })),
          item("men", "Show where it is mentioned", () => a.askSpine(`Where is "${name}" mentioned?`, { source: "graph" })),
          sep,
          ...common,
        ];
      }

      if (n.type === "team") {
        return [item("mem", "Who is on this team?", () => a.askSpine(`Who is on the ${name} team?`, { source: "graph" })), sep, ...common];
      }
      return [...common];
    },

    canvas: () => {
      const g = a.graphApi.current;
      const cypher = g?.lastCypher() ?? null;
      return [
        item("fit", "Fit to screen", () => g?.fit(), { icon: icon(ScanLine) }),
        item("how", "Show how I did this", () => g?.toggleDrawer(), { icon: icon(Terminal) }),
        item("legend", g?.legendHidden ? "Show the legend" : "Hide the legend", () => g?.toggleLegend(), {
          icon: icon(g?.legendHidden ? Eye : EyeOff),
        }),
        sep,
        item("cypher", "Copy the Cypher (last step)", () => cypher && a.copy(cypher, "Cypher"), {
          icon: icon(Copy),
          disabled: cypher ? false : "No question has run a query yet.",
        }),
      ];
    },

    finding: (f, pt) => {
      const title = findingTitle(f);
      const target = displayName(f.target_name, "");
      // The facts a person could be asked to confirm for this finding.
      // The finding's target may be the thing itself or one of its facts.
      const about = a.claims.filter((c) => c.id === f.target_id || c.about?.id === f.target_id);
      const checkable =
        f.kind === "decay"
          ? about.filter((c) => c.stale)
          : f.kind === "contradiction" || f.kind === "verification_requested"
            ? []
            : about.filter((c) => c.fact_type === "ownership");
      return [
        item("show", "Show on the graph", () => a.showFinding(f), { icon: icon(Network) }),
        item("why", "Why is this flagged?", () => showPopover(pt, createElement(WhyFlagged, { finding: f, claims: a.claims }), title), {
          icon: icon(Info),
        }),
        item("copy", "Copy summary", () => a.copy([title, target, whyItMatters(f)].filter(Boolean).join(" — "), "Summary"), {
          icon: icon(Copy),
        }),
        ...(a.isAdmin
          ? [
              item("vera", "Ask Vera to check this", () => void a.veraAsk(checkable.slice(0, 3).map((c) => c.id), title), {
                icon: icon(MessageCircleQuestion),
                disabled: checkable.length ? false : "There is no single fact to check for this one.",
                confirm: `Ask Vera to check ${Math.min(3, checkable.length)} ${checkable.length === 1 ? "fact" : "facts"} about ${target || "this"} with a person? It changes no fact.`,
              }),
            ]
          : []),
        sep,
        item(
          "hide",
          "Hide for me",
          () => {
            setPrefs({ hiddenFindings: [...getPrefs().hiddenFindings, f.finding_id] });
            a.notify({ title: "Hidden for you.", lines: ["It is still in SPINE; only your view changed."] });
          },
          { icon: icon(EyeOff) }
        ),
      ];
    },

    answer: (selection) => {
      const has = a.answer.trim().length > 0;
      const none = "There is no answer yet.";
      const withSources = () =>
        [a.answer, "", "Sources:", ...a.evidence.map((e) => `- ${e.text} (${Math.round(e.confidence * 100)}% sure)`)].join("\n");
      const quote = selection.length > 120 ? `${selection.slice(0, 117)}…` : selection;
      return [
        item("copy", "Copy answer", () => a.copy(a.answer, "Answer"), { icon: icon(Copy), disabled: has ? false : none }),
        item("src", "Copy with sources", () => a.copy(withSources(), "Answer and sources"), {
          disabled: has && a.evidence.length ? false : has ? "This answer used no stored facts." : none,
        }),
        item("ev", "Show evidence", () => window.dispatchEvent(new CustomEvent("spine:open-evidence")), {
          icon: icon(Search),
          disabled: a.evidence.length ? false : "This answer used no stored facts.",
        }),
        item("how", "Show how I did this", () => {
          a.openWindow("graph");
          a.graphApi.current?.toggleDrawer();
        }, { icon: icon(Terminal) }),
        sep,
        item("wrong", "This looks wrong", () => void a.feedback(), {
          icon: icon(ThumbsDown),
          danger: true,
          disabled: has ? false : none,
          confirm: "Tell Vera this answer looks wrong? She will check the facts it used with a person. Nothing changes until a person answers.",
        }),
        ...(selection
          ? [item("follow", `Ask a follow-up about “${quote}”`, () => a.askSpine(`Tell me more about: ${selection}`, { source: "answer" }))]
          : []),
      ];
    },

    evidence: (claimId, text, pt) => {
      const c = claimOf(claimId);
      return [
        item("math", "Show the confidence math", () => c && showPopover(pt, createElement(ConfidenceMath, { claim: c }), "Why this much trust"), {
          disabled: c ? false : "SPINE has no more detail on this fact.",
        }),
        item(
          "who",
          "Show who said it and when",
          () =>
            c &&
            a.notify({
              title: "Where this came from",
              lines: [`${c.source ?? "An unknown source"}${c.asserted_at ? `, ${shortDate(c.asserted_at)}` : ""}.`],
            }),
          { disabled: c ? false : "SPINE has no more detail on this fact." }
        ),
        item("show", "Show on the graph", () => {
          if (c?.about?.id) {
            a.openWindow("graph");
            a.highlight(c.about.id);
          }
        }, { disabled: c?.about?.id ? false : "This fact isn't tied to anything on the graph.", icon: icon(Network) }),
        item("copy", "Copy", () => a.copy(text, "Fact"), { icon: icon(Copy) }),
      ];
    },
  };
}

/** The menus, bound to the current windows and actions. Null on a phone,
 * where nothing is right-clickable. */
export function useMenus(): Menus | null {
  const a = useActions();
  const win = useWindowsMaybe();
  const { showPopover } = useContextMenu();
  return useMemo(() => (a ? build({ a, win, showPopover }) : null), [a, win, showPopover]);
}
