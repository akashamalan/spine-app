# SPINE_OS_APPS — THE REACT BITS DOCK, RIGHT-CLICK MENUS, AND THE COMPANY APPS

An **addendum to `SPINE_OS.md`**. Run with **Opus**. Commit after each phase. All of `SPINE_OS.md` §0 (preconditions,
global rules) and §2 ("windows own no state") still apply. Frontend only, **except** where a phase says "needs endpoint",
and then only the endpoints already listed in `SPINE_V2.md` Job 3.2 (plus one optional read-only query route in A6).

**Order:** `SPINE_OS.md` phases O1–O7 first. The one exception: **A1 replaces O2's Dock**, so if O2 is not built yet,
do A1 instead of the Dock half of O2.

---

## A0 — THE RULES FOR THIS ADDENDUM

1. **Never show something that does not work.** If an app's endpoint is missing, hide that app from the dock and list
   the missing endpoint in the report. No fake numbers, no empty shells.
2. **No context-menu item may change Layer 2.** Menu actions only: navigate, ask a question, copy, filter, or call an
   existing endpoint that writes Layer 3 (`/api/feedback`, `/api/vera/ask`). The trust rule is unchanged.
3. **Plain words.** No raw ids, no "entity", "claim id", "node". Say "person", "service", "document", "fact".
4. **Never copy Apple.** Strip every "macOS" word from copied component comments and UI text. Our own icons.
5. Type scale 15 / 13 / 17 / 20. Glass classes only. Dark only. No new dependencies (use `motion`, already installed).
6. Credit the React Bits Dock in the README's "Credits" section. I believe React Bits is MIT with the Commons Clause;
   open its repository license and tell me what it actually says before you ship it.

---

## PHASE A1 — SWAP IN THE REACT BITS DOCK

I will paste the component's source below the prompt. **Adapt it; do not paste it in unchanged.**

Keep from the original: magnification, launch bounce, badges, tooltips, the divider, the context-menu hook.
Change to fit SPINE:

- Items are driven by `windows.config.tsx` (id, title, icon, adminOnly, group), not hard-coded.
- **Groups with dividers:** `Ask · The graph · What SPINE noticed · Vera` | `Directory · Facts · Activity` |
  `Simulation · Query` (admin only) | `Settings`.
- **Running dot** under an icon when its window is open; **hollow dot** when minimized.
- **Launch bounce** plays when a closed app is opened. **Attention bounce** (twice, never loops) plays only for a new
  Vera question (SPINE_OS Phase O4). Same animation code, different trigger.
- **Badges:** Vera = my open questions · What SPINE noticed = urgent findings (red dot) · Facts = facts "probably
  outdated" (count). Hide at 0.
- Our glass pill (`glass`), 52px tiles, radius 16, our own line icons (hugeicons / inline SVG).
- `onContextMenu` on every icon feeds the context-menu engine from A2.
- Keyboard: `role="toolbar"`, arrow keys move, Enter opens, ContextMenu key / Shift+F10 opens the menu.
- Reduced motion: no magnification, no bounce.
- Responsive: if the dock would be wider than 92vw, shrink tiles to 44px; never wrap.

Commit `apps-1`.

---

## PHASE A2 — THE RIGHT-CLICK ENGINE (useful, not decorative)

### The engine

`app/os/context/ContextMenuProvider.tsx` + `useContextMenu()` + `ContextMenu.tsx`.

```ts
type MenuItem =
  | { type: 'item'; id: string; label: string; icon?: ReactNode; hint?: string;     // hint = 13px grey text
      shortcut?: string; disabled?: boolean | string;                                 // string = reason shown as tooltip
      danger?: boolean; onSelect: () => void }
  | { type: 'submenu'; id: string; label: string; icon?: ReactNode; items: MenuItem[] }
  | { type: 'separator' }
  | { type: 'label'; text: string };                                                  // small section title
```

Any component calls `openMenu(event, items)` from its own `onContextMenu`. There is also a desktop-level fallback
handler (`data-ctx="desktop"`), so right-clicking empty wallpaper gives the desktop menu.

### Behaviour

- Opens at the pointer, **clamped to the viewport**, flips left/up near edges. Submenus open right (flip left if no room).
- Looks: `glass-strong`, radius 16, padding 6, item height 36, label 15px, hint/shortcut 13px muted, danger items red.
- Animation: scale .96→1 + opacity, 120ms, transform-origin at the pointer. Reduced motion: opacity only.
- Keyboard: ↑ ↓ move, → opens a submenu, ← closes it, Enter selects, Esc closes, type-ahead by first letter.
  `role="menu"` / `menuitem`, focus moves into the menu and **returns to the trigger on close**.
- Closes on: outside pointerdown, scroll, window resize, window blur, another right-click, route/state change.
- **Do not hijack where native is better.** Keep the browser's own menu on `<input>`, `<textarea>`,
  `contenteditable`, on links the user selected text in, and always on **Shift + right-click** (developer escape hatch).
- A disabled item shows a reason on hover ("Only admins can do this"). Do not hide it; people should learn it exists.
- Selecting an item that **writes** (feedback, ask Vera) shows a confirm toast ("Send this to Vera?") before calling.
- Every menu stays ≤ 9 items. Group with separators and small labels. No menu may be empty.

### The menus (build exactly these; each item must work)

**Desktop (empty wallpaper)**
- Ask a question… (Ctrl/⌘+K) · Scan now
- Windows ▸ Open all · Minimize all · Tidy windows (reset layout)
- Wallpaper ▸ Calm · Normal · Lively (changes `speed`/`flicker` props of the existing backdrop only; remembered in localStorage)
- Getting started · About SPINE

**Window title bar**
- Minimize · Maximize / Restore · Close · Bring to front · Reset this window's position

**Dock icon** (per app)
- Open / Show · Minimize · Close · Reset position
- App-specific extras: **Vera** → "Show only my questions" · **What SPINE noticed** → "Show only urgent" ·
  **The graph** → "Fit to screen"

**Graph: a person** (React Flow node)
- What does {first name} own? *(asks it)* · What breaks if {first name} leaves? *(asks it)*
- Show their card · Highlight on the graph · Copy name
- *(admin, only if `/api/vera/ask` exists)* Ask Vera to check with them
- If the person has left: label the first item "Who took over from {first name}?"

**Graph: a service**
- Who owns this? · What depends on it? · What breaks if it goes down?
- Show the documents about it · Copy name

**Graph: a document**
- How old is this? *(shows the age/decay line in a toast)* · Does any document disagree with this?
- Show where it is mentioned · Copy title

**Graph: empty canvas**
- Fit to screen · Show how I did this · Hide / show the legend · Copy the Cypher *(last hop)*

**A row in "What SPINE noticed"**
- Show on the graph · **Why is this flagged?** · Copy summary
- *(admin)* Ask Vera to check this *(`/api/vera/ask`)* · Hide for me *(local only; never deletes anything)*

**The answer text**
- Copy answer · Copy with sources · Show evidence · Show how I did this
- **This looks wrong** *(calls `/api/feedback`, confirm first)* · Ask a follow-up about the selected text *(only when text is selected)*

**An evidence / fact row**
- **Show the confidence math** · Show who said it and when · Show on the graph · Copy

### "Why is this flagged?" and "Show the confidence math" (the judge moment)

A small glass popover that explains the decay in plain words using the **real** numbers (no invention):

```
Fact                    Sam Okafor owns the billing service
Started at              <base_conf>%
Age                     <age>  ·  this kind of fact halves every <half_life>   → <decay factor>
Confirmed by            <source_count> sources                                 → <boost>
Now                     <live confidence>%   <status pill>
```

Every `<value>` above is a placeholder: fill it from the API and the formula in `backend/utils/confidence.py`
(`base × 0.5^(age/half_life) × min(1.5, 1 + 0.15·ln(sources))`). Show the final number exactly as the backend computes it,
and make the lines multiply out correctly on screen. Compute only from fields the API already returns (`base_conf`, `asserted_at`, `half_life`, `source_count`,
live confidence from `GET /api/claims`). If a field is missing, hide the line, do not fake it. This popover is what shows
a judge that truth decay is real and explained, not a magic number.

### Plumbing

Add to `useSpine`: `askSpine(text, { source })` — sets the question, submits it, and (per SPINE_OS O3) opens and
focuses the Ask, Graph and Answer windows. Every "asks it" menu item uses it.

Commit `apps-2`.

---

## PHASE A3 — TWO FRONTEND-ONLY APPS (no backend needed)

### Getting started (for new employees)

Opens automatically the first time a person arrives on the desktop (store `spine-onboarded` in localStorage, try/catch),
and any time from the Help menu, the dock right-click, or Settings.

- A glass window with a 5-step guided tour; each step highlights one thing and says one plain sentence:
  1. "This is your company. Every dot is a person, a service or a document."
  2. "Ask anything. SPINE walks the graph and shows you how it found the answer."
  3. "Colours tell you how fresh a fact is. Green is up to date; red is probably outdated."
  4. "Vera asks the right person when something looks wrong. Only a human's answer changes what SPINE believes."
  5. "Right-click anything. Most things have a useful menu."
- Under the tour: **6 sample questions as buttons** (taken from the real seed: ownership, blast radius, deploy). Clicking
  one closes the tour and runs it via `askSpine`.
- Esc or "Skip" always works. No tour spotlight that traps focus.

### Settings

- **Motion:** follow my system / reduce motion (a real toggle that feeds the same flag everything uses).
- **Wallpaper:** Calm / Normal / Lively (same control as the desktop menu).
- **Windows:** Reset layout · "Remember my layout" on/off.
- **Person:** current person + role, "Switch person" (demo identity).
- **About SPINE:** what it is in 3 sentences, the trust rule in one sentence, and these two honest lines:
  *"All people, services and documents in this demo are invented."* and
  *"Built with the help of AI coding assistants."* (hackathon Rules 6 and 11).
- No "dark/light" toggle (dark only for now).

Commit `apps-3`.

---

## PHASE A4 — THE COMPANY APPS (need endpoints; hide any whose endpoint is missing)

### Directory  (needs `GET /api/people`, `GET /api/entities`)

The company address book, for **everyone**. Search box; filter chips **People · Services · Documents · Teams**.
- A person row: initials avatar, name, role, team, what they own, a "Left in Apr 2025" pill if gone.
- A service row: name, owner, health dot (red when orphaned or single owner).
- A document row: title, age pill ("14 months old", amber/red).
- Click a row → a card on the right with the full detail and two buttons: **Show on the graph** (focus it) and
  **Ask about it** (via `askSpine`). Right-click any row uses the menus from A2.
- Replaces the old admin-only "People" window. Admins additionally see "Ask Vera to check" actions.

### Facts  (needs `GET /api/claims`)

The **truth ledger**: every fact SPINE believes, sorted by *least trusted first*.
- Columns: the fact in a plain sentence · confidence bar + percent · age · number of sources · status pill
  (Up to date / Getting old / Probably outdated / Replaced).
- Filter chips by status; search box; a "Replaced" filter shows superseded facts, labelled "replaced", never as current.
- Click a row → the confidence-math popover (A2).
- Header strip: the five live numbers from `SPINE_GRAPH.md` Part 5, so the app doubles as the dashboard.
- Sparkline of age distribution is optional; skip it unless trivial.

Dock badge for Facts = number of "Probably outdated".

Commit `apps-4`.

---

## PHASE A5 — ACTIVITY (the trust rule, made visible)  (needs `GET /api/vera/history`, `GET /api/findings`)

One chronological feed (newest first) of everything that happened, grouped by day:

- 🔎 SPINE noticed … (a finding; source: patrol agent)
- 💬 Vera asked {person} … 
- ✅ {person} answered: *"their exact raw words"* → *"fact X was replaced by fact Y"*
- ⚙️ Simulation: {scenario} (admin only; only when simulation rows exist)

Rules:
- The human's **raw words** appear verbatim in quotes, with who said it and when.
- A line "Only a person's answer changed this fact." appears next to every replaced-fact entry. This is the one idea that
  makes SPINE different from a chatbot; make it impossible to miss.
- Filters: All · Findings · Vera · Changes. Click an entry → Show on the graph.
- New entries slide in live when the findings stream pushes them (no refresh).

Commit `apps-5`.

---

## PHASE A6 — OPTIONAL STRETCH: QUERY (read-only Cypher console, admin only)

Only if A1–A5 are fully verified. This is the feature that makes a FalkorDB judge smile, so do it carefully or not at all.

- **Backend (the only exception):** `POST /api/query`, admin-only (server-side 403), uses **`GRAPH.RO_QUERY`** (read-only)
  with a 5-second timeout and a 200-row cap. Reject anything containing write keywords
  (`CREATE, MERGE, DELETE, SET, REMOVE, DROP, CALL db.`) as a second safety layer. Return `{columns, rows, ms}`.
  Log each query line (person, ms, row count).
- **Frontend:** a mono input, a Run button (Ctrl/⌘+Enter), a results table, 5 saved example queries, and a "Show on the
  graph" button when results contain nodes. Errors show plainly ("That query is not allowed: it would change data").
- Prove the guard works: paste me the output of a `CREATE` attempt being rejected.

Commit `apps-6`.

---

## QA — DO NOT REPORT DONE UNTIL ALL TRUE

1. The dock shows the grouped apps with correct running / hollow dots and badges; magnification and launch bounce work;
   Vera's attention bounce still plays exactly twice per new question.
2. Right-click works on: the wallpaper, a window title bar, every dock icon, a graph person, a graph service, a graph
   document, the empty graph canvas, a findings row, the answer text, an evidence row. **Paste a screenshot of five of
   them.**
3. Native right-click still works in inputs and with Shift held.
4. Every menu item does what its label says. Items needing a missing endpoint are hidden (listed in the report) or
   disabled with a reason.
5. "This looks wrong" and "Ask Vera to check" show a confirm first and write only Layer 3. Show that Layer 2 is unchanged.
6. The confidence-math popover uses real numbers from the API. Show one for a 14-month-old fact.
7. Getting started opens once for a new browser and never again unless asked; all 6 sample questions run.
8. Directory, Facts and Activity each load real data; Facts is sorted least-trusted-first; Activity shows a human's raw
   words verbatim next to a replaced fact.
9. Keyboard: Tab reaches dock and windows; arrow keys work in the dock and in menus; Esc closes menus; focus returns to
   the trigger.
10. Reduced motion verified. `tsc`, `lint`, `build` clean; no new dependencies; credits line added to README.

**Screenshots:** dock (grouped, with badges), five right-click menus, the confidence-math popover, Getting started,
Directory, Facts, Activity, and (if built) Query with a rejected `CREATE`.

---

## REPORT FORMAT

1. What changed in plain words (5 lines).
2. Files created / touched.
3. Missing endpoints that caused an app or menu item to be hidden.
4. What to click to see each app and each right-click menu.
5. QA checklist ✅/❌ per line + screenshots + `tsc` / `lint` / `build` output.
