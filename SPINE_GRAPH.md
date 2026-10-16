# SPINE_GRAPH — MAKE THE GRAPH THE STAR OF THE DEMO

This **replaces Phase 4 of `SPINE_BENTO.md`**. All of SPINE_BENTO §2 Global Rules still apply, with ONE exception
listed in Part 1 (a small additive backend change is allowed). Run with **Opus**. Commit after each part.

---

## WHY THE CURRENT GRAPH FAILS (from a real screenshot)

- A force layout with 3–6 nodes inside a short, wide panel → tiny dots floating in empty space.
- Nodes are bare squares/circles with unreadable 8px labels. No faces, no confidence, no "owner left".
- The hop list ("HOP 2 Finding that in the graph…") lives INSIDE the graph panel and eats half its height.
- The legend is technical ("Step / Result / Flagged").
- Nothing draws the actual path SPINE walked.

The fix is not "make it bigger". The layout has to match the question, nodes have to carry meaning, and the path
has to be drawn on screen as it happens.

---

## PART 1 — BACKEND: A CLEAN SUBGRAPH ON EVERY HOP (additive only)

Allowed exception to "frontend only": **add** a field to the hop events; change nothing else.

On every hop event that `/api/ask` streams, add:

```json
"subgraph": {
  "nodes": [
    { "id": "...", "type": "person|service|document|team|claim|finding",
      "label": "Sam Okafor", "sublabel": "Platform Engineer",
      "confidence": 0.90, "stale": false, "left": false, "superseded": false,
      "asserted_at": "2025-08-01", "is_focus": true }
  ],
  "edges": [
    { "source": "...", "target": "...", "type": "OWNS|DEPENDS_ON|MENTIONS|SUPERSEDES|CONTRADICTS|MEMBER_OF",
      "confidence": 0.9, "superseded": false, "on_path": true }
  ]
}
```

- Build it from what each tool already queries. Return only what that hop touched (typically 2–25 nodes).
- `is_focus` marks the entity the question is about. `on_path` marks edges SPINE actually walked.
- `left` = person has `left_at`. `stale` = live confidence < 0.6. `superseded` = has an incoming SUPERSEDES.
- Live confidence uses the existing decay formula (`backend/utils/confidence.py`). Do not invent a new one.
- Also add `GET /api/graph/overview` → the same `{nodes, edges}` shape for the whole company **without claims and
  findings** (people, teams, services, documents only; ~40–70 nodes) for the idle map.
- Existing fields, the SSE format, and the trust rule are untouched. Prove it: the old frontend still works.
- Paste me one real hop event with its `subgraph` for "who owns the billing service?".

Commit `graph-1`.

---

## PART 2 — SWITCH THE PANEL TO REACT FLOW

- `npm install @xyflow/react` (MIT; v12 supports React 19). Use `colorMode="dark"`. Keep the small attribution badge.
- New `app/components/graph/GraphPanel.tsx`. Remove Cytoscape from this panel. Once nothing else imports it,
  uninstall `cytoscape` and `@types/cytoscape`.
- **No layout library.** Positions are computed by our own small, deterministic functions in
  `app/components/graph/layouts.ts`. That is what makes it look deliberate instead of random.
- Panel is non-interactive-scroll by default (`panOnScroll={false}`, `zoomOnScroll` only in Focus mode) so it never
  traps the page scroll. `fitView` with padding after every change, animated (`duration: 600`).

### 2.1 Four layouts, chosen by the question's intent (the backend already classifies intent)

| Intent | Layout | Rule |
|---|---|---|
| ownership / who_knows | **Ego (target)** | focus node at centre · people on ring 1 · documents/claims on ring 2 · even angular spacing, sorted by type |
| impact / blast_radius | **Blast radius** | focus at centre · ring N = N hops away · ring radius grows ~120px per ring · broken/flagged nodes get the red ring |
| process / general | **Path (subway line)** | nodes left→right in hop order on one line; side-branches drop below their stop |
| idle (no question) | **Company map** | team "islands": each team is a soft glass group node with its people inside; services float next to their owners' team |

Each layout returns `{x, y}` per node id. Radii scale to the panel size (measure it with `react-use-measure`).

### 2.2 Node types (custom React nodes)

| Type | Looks like |
|---|---|
| **person** | 44px circle, initials, tinted by team · **confidence ring** around it: full arc 🟢 ≥80%, ¾ 🟠 60–79%, thin 🔴 <60% · name below in 13px |
| **person who LEFT** | same, but **hollow, dashed border, 40% opacity** — a "ghost" · small label "Left in Apr 2025" |
| **service** | glass pill: icon + name (15px) · tiny dot for health (red if orphaned / single owner) |
| **document** | small glass card: 📄 title + age pill ("14 months old", 🟠/🔴 by age) |
| **team** (idle map only) | large soft rounded group with team name at top |
| **claim** | not drawn as a node — shown as the **edge label** of the relationship it asserts |
| **finding** | a small red badge pinned to the node it is about ("Nobody looks after this") |

The **focus node** is 1.4× size with a soft glow. Hover: lift + tooltip with one plain sentence.
Click: person → PersonCard; service/document → its card (Phase 6 of SPINE_BENTO).

### 2.3 Edge types

| Meaning | Style |
|---|---|
| confident relationship | solid 2px, white at 50% |
| stale | solid, 25% opacity |
| superseded ("replaced") | dashed, 20% opacity, label "replaced" on hover |
| on the path SPINE walked | brighter 2.5px, `#0A84FF`, animated draw-in |
| contradiction between two documents | red `#FF453A` with a small ⚡ marker in the middle |
| owner left | dashed from the ghost node |

Edge labels in plain words, shown only for on-path edges ("owns", "depends on", "mentions", "replaced by").

---

## PART 3 — THE HOP-BY-HOP ANIMATION (the moment judges remember)

Driven by the real stream, in sync with the "thinking line" in the Answer panel:

1. New question → the idle map fades to 15% and blurs slightly (no layout jump).
2. Each hop arrives → its new nodes **pop in** (scale .6→1, opacity 0→1, 250ms, staggered 40ms), its on-path edges
   **draw themselves** (stroke-dashoffset), the camera **glides** (`fitView({nodes: hopNodes, duration: 600})`).
3. A small light **travels along the newest on-path edge once** (SVG `animateMotion` or an animated circle; 700ms).
   One traveller at a time. Then it stops.
4. A flagged node (left / stale / contradiction) **pulses twice** with its red ring when it lands — never forever.
5. Final answer → everything off the path dims to 35%; the path stays bright; `fitView` on the whole answer subgraph.
6. Reduced motion: no traveller, no pulses, no camera glide — nodes just appear in their final place.

---

## PART 4 — PANEL CHROME AND LEGEND (plain words)

- **Move the hop list OUT of the graph panel.** The list lives in a "Show how I did this" drawer that slides up over the
  bottom 45% of the graph panel (glass-strong), each hop as a row with a plain title, result count, and its real Cypher in
  a mono block with a copy button. Closed by default.
- Top-right of the panel: **Fit** · **Show how I did this** · **Expand** (Focus mode from SPINE_BENTO Phase 6).
- Legend (bottom-left, glass-thin pill, collapsible): ● Up to date · ● Getting old · ● Probably outdated · ◌ Has left the
  company · ━ The path SPINE took · ⚡ Two documents disagree.
- Idle hint line under the title: "This is your company. Ask something and watch SPINE walk through it."
- **Give the graph room:** while an answer is streaming, the grid rows become `1.4fr 1fr auto` (graph bigger); after the
  answer lands they animate back to `1fr 1.2fr auto`. One shared layout animation, 400ms, bounce 0.

---

## PART 5 — "MORE ON SCREEN": FIVE LIVE NUMBERS THAT MAKE THE DEMO CONVINCING

Add a compact stats strip at the **top of the left panel** (above the category chips), glass-thin tiles, numbers count up:

| Tile | Meaning (plain words) | Source |
|---|---|---|
| **Facts up to date** | "68% of what SPINE knows is fresh" + tiny bar | `GET /api/claims` (add if missing: live confidence per claim) |
| **Single points of failure** | "3 things only one person knows" | bus-factor findings count |
| **Nobody looks after** | "2 services have no owner" | orphan findings count |
| **Average fact age** | "7 months" | claims `asserted_at` |
| **Fixed by people this week** | "4 answers to Vera" | resolved findings / responses |

Each tile: hover shows one sentence explaining it; click filters the list below. If an endpoint is missing, hide that
tile (never show a fake number) and list the endpoint in the report.

---

## ACCEPTANCE — DO NOT REPORT DONE UNTIL ALL TRUE

1. Idle: the company map shows team islands with readable names (≥13px) filling the panel — no empty void.
2. "Who owns the billing service?" → ego layout; Sam is a full-ring person; Priya is a ghost with "replaced" dashed edge;
   the path is drawn hop by hop in sync with the thinking line.
3. "What breaks if the user service goes down?" → blast-radius rings; affected services ring out from the centre.
4. "How do we deploy?" → path layout; the 14-month-old deploy doc shows its age pill; the two disagreeing runbooks show ⚡.
5. The hop list is not inside the graph area unless the drawer is opened. Cypher is real and copyable.
6. Only one traveller animation at a time; nothing animates forever except the backdrop. Reduced motion verified.
7. Cytoscape fully removed if unused. `tsc`, `lint`, `build` clean, 0 dev issues. Old SSE consumers still work.
8. Screenshots in the report: idle map, mid-hop (ownership), final (ownership), blast radius, path.
