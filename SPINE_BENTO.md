# SPINE_BENTO — REBUILD THE HOME SCREEN AS A LIVE GLASS BENTO

Project: `C:\Users\akash\OneDrive\Desktop\spine-app`  ·  Frontend: `frontend/`  ·  Backend: `backend/` (port 8004)
Run with **Opus**. Work in phases. **Commit after every phase.** Report after the last phase you were asked to do.

---

## 0. THE GOAL IN ONE SENTENCE

`http://localhost:3000/` (the real app, wired to the real backend) must become the glass bento that already
exists as an empty shell at `http://localhost:3000/bento` — and everything a new employee needs and the current
screen lacks must be added.

Today `/` is three cramped flat columns with 11px text, jargon ("Reflex Layer", "Confidence Floor"), and no
feedback. `/bento` is five empty glass panels over the animated ASCII background. **Merge them.**

---

## 1. WHAT ALREADY EXISTS — read these first, do not re-survey blindly

**Shell (done, working):**
- `app/components/Backdrop.tsx` — fixed ASCII backdrop + dark scrim. Only ONE WebGL canvas may exist.
- `app/components/Bento.tsx` — `<Bento left graph answer ask right />`, 5 glass panels, grid
  `grid-cols-[1fr_2.2fr_1fr] grid-rows-[1fr_1.2fr_auto]`.
- `app/bento/page.tsx` — the placeholder preview route.
- `.glass` in `globals.css` (dark only, with `@supports` + `prefers-reduced-transparency` fallbacks).
- `app/components/WelcomeScreen.tsx` + `TextType.jsx` — finished. Do not touch.

**Real app (working, wired):** `app/page.tsx` (~21KB, one big client component) holds ALL of this state and logic:
`findings, hops, answer, evidence, toast, isScanning, showWelcome, isAsking, question, probes, veraState,
showVera, selectedFinding, graphStats, backend, streamEpoch` and these calls:

| Call | Used for |
|---|---|
| `GET /health` (polled every 10s) | backend + LLM status, banners |
| `GET /api/graph/stats` | node/edge counts |
| `GET /api/findings/stream` (SSE, reopened after outages) | live findings |
| `POST /api/ask` (SSE stream of hops + final answer/evidence) | the answer engine |
| `POST /api/reflexes/run` | "Run Reflexes" |
| `GET /api/vera/probes` | Vera's questions (`dedupeProbes()` guards duplicate keys) |
| `POST /api/vera/respond` | a human answer → Layer 2 |
| `GET /api/entity/{id}` | one entity |

Existing panels and their props: `PulsePanel({findings,onSelect,selected})`,
`StagePanel({hops,isAsking,…})` (holds the Cytoscape graph), `AnswerPanel({answer,evidence,hops,selectedFinding,…})`,
`VeraOverlay({probes,onClose,onRespond})`, `VeraGlyph`, `ThemeToggle`. Plain-language helpers: `app/lib/labels.ts`
(`isRawId()`, `displayName()`, label maps). Types: `Finding`, `Evidence`, `HopEvent`, `VeraProbe` exported from `page.tsx`.

**Hard facts about the backend (do not break):**
- Reflexes write ONLY to Layer 3. Only `/api/vera/respond` changes Layer 2, and the human's words are stored raw.
- Superseded claims are never shown as current. Findings that a Vera answer fixes now resolve themselves.
- Live graph: ~92 nodes, ~117 edges, ~17 findings, ~7 probes. Groq key is valid.

**Read for context:** `SPINE_REDESIGN.md` **Part A** (the plain-language dictionary — use it verbatim) and **Part B**
(Global Rules — all still apply). `SPINE_LOOK.md` §3–§6 for glass and "professional" limits. Ignore their
layout sections; **this document's layout wins.**

---

## 2. GLOBAL RULES (every phase)

1. **Frontend only.** Do not edit anything in `backend/`. If you need an endpoint that doesn't exist, build the UI so it
   degrades gracefully (the call fails → local fallback + a quiet toast), and list the missing endpoint in your report.
2. **Never break:** the SSE streams, `dedupeProbes`, the health banners, `AbortController` on asks, the Vera POST body.
3. **No raw ids on screen. Ever.** Use `displayName()`. Run the grep in Phase 7.
4. **Real data only.** No pravatar, no unsplash, no lorem. Avatars are initials on a tinted circle.
5. **Plain words.** Panel titles, buttons, tooltips, empty states, errors: everyday language a new hire understands.
   Use the Part A dictionary: "Only one person knows this", "Nobody looks after this", "This might be outdated",
   "Two documents disagree", "The owner has left". Confidence: 80+ 🟢 Up to date, 60–79 🟠 Getting old, <60 🔴 Probably
   outdated. Severity: Urgent / Soon / When you can. Status dots are coloured circles, not emoji, inside the UI chrome.
6. **Type scale (fixes the tiny-text problem):** body 15px · small 13px (never below) · panel title 17px/600 ·
   hero answer 20px/500. Weights 400/500/600 only. Max 3 sizes per panel + 1 caption.
7. **Glass only.** Every surface uses `.glass` (or a `.glass-strong` / `.glass-thin` variant you add next to it). A flat
   opaque box is a bug. Text contrast ≥ 4.5:1 over the real moving background — verify with a screenshot, not by guessing.
   Status colours appear only as dots, pills and bars — never as big fills.
8. **One thing moves at a time.** Do not run two continuous animations in different panels. The backdrop is the only
   always-moving thing. Everything else animates on events (mount, hover, press, new data).
9. **Motion:** `motion/react` (already installed). Spring `bounce: 0`, 0.4s default. Feedback on press-down, not release.
   Animate only transform / opacity / box-shadow — never blur or background. Respect `prefers-reduced-motion`
   (no movement, instant state) and `prefers-reduced-transparency` (solid panels).
10. **No new dependencies** unless a phase says so. No `any`. `npx tsc --noEmit`, `npm run lint` (warnings in
    `GradientASCII.jsx` are known) and `npm run build` must pass at the end of EVERY phase, with 0 Next.js dev issues.
11. **Dark only for now.** Hide `ThemeToggle` (don't delete the file). Light theme is out of scope.
12. **Hydration:** the warning from a Chrome extension is not ours — test in incognito. Don't "fix" `layout.tsx`.
13. Every phase ends with: what changed in plain words · files touched · what fought back · exactly what to click ·
    a screenshot of `/`.

---

## PHASE 1 — EXTRACT THE BRAIN (behaviour-preserving, no visual change)

`page.tsx` is a 21KB monolith. Make it thin so the new layout can reuse it.

1. `git status`; make sure `.env` is git-ignored. Commit a checkpoint, then create branch `bento`.
2. Move the shared types (`Finding`, `Evidence`, `HopEvent`, `HopResult`, `VeraProbe`, `BackendStatus`) to
   `app/lib/types.ts`. Re-export them from `page.tsx` so nothing else breaks.
3. Move ALL state, fetching, SSE, polling, asking, scanning and Vera-respond logic into a hook
   `app/lib/useSpine.ts` returning one typed object: `{ findings, hops, answer, evidence, probes, selectedFinding,
   setSelectedFinding, isAsking, isScanning, backend, stats, ask(question), stopAsking(), scan(), respond(probeId, text),
   toast, dismissToast }`. Preserve **every** edge case listed in §1 and in the existing code comments.
4. `page.tsx` becomes: welcome gate + `<Home />` (still rendering the OLD three-pane layout from the hook).
5. Prove nothing changed: ask the 4 demo questions, run reflexes, answer a Vera probe, kill and restart the backend —
   same behaviour as before. Build passes. Commit `phase-1`.

## PHASE 2 — THE SHELL (replace the old layout)

1. `Home.tsx` renders `<Backdrop />` (mounted only after the welcome screen has unmounted — never two canvases at once)
   and `<Bento />`. Delete the old three-pane JSX. Keep the old panel components on disk until Phase 7.
2. **Top pill** (floating, `glass-thin`, centred, `top-4`): SPINE wordmark · backend status dot (green / amber / red with
   a plain-words tooltip) · "Scan now" button (calls `scan()`, spinner while running, plain result toast:
   "Checked everything. 2 new things to look at.") · identity chip placeholder (initials circle, "You").
3. **Bottom pill** (floating, `glass-thin`): plain-words counts — "92 facts · 117 connections · 17 things to look at ·
   7 questions for people". Numbers count up when they change. If the graph is unreachable: "Can't reach the graph".
4. Keep the red/amber outage banners; restyle as glass toasts that slide under the top pill.
5. **Mobile (<768px):** a segmented control (Noticed · Ask · Vera) switches ONE visible panel at a time.
6. `/bento` placeholder route: delete it.
7. Build · commit `phase-2`.

## PHASE 3 — LEFT PANEL, ASK BAR, ANSWER (the core loop)

**Left — "What SPINE noticed"** (replaces `PulsePanel`, same `findings` + `selectedFinding` contract):
- Summary chips on top: four categories in plain words with live counts; tapping one filters the list.
  (Only one person knows this · Nobody looks after this · This might be outdated · Two documents disagree.)
- List grouped Urgent / Soon / When you can. Each row: coloured severity dot · plain title · one line "why it matters" ·
  target name via `displayName()` · small relative time ("2 min ago"). New rows slide in (`AnimatePresence`).
- Click a row → `setSelectedFinding`; the answer panel shows that finding's detail; the matching node highlights in the graph.
- Empty state: "All clear. SPINE is watching." with a friendly line, never a blank.
- A star on each row saves it to a local "Watching" list (`localStorage`, try/catch) — UI only, never changes the graph.

**Ask bar** (center bottom, `.glass-strong` capsule): single input, 16px, `⌘K / Ctrl+K` focuses it, Enter sends, Esc
clears, `AbortController` + a Stop button while asking. Below it: 4 example chips (existing `EXAMPLE_QUESTIONS`) that
fill-and-send, plus the last 5 questions from `localStorage` as quieter chips. Disabled with a plain reason when the
backend is unreachable.

**Answer panel** (center middle, the hero — give it the most space):
- While asking: a "thinking line" driven by the **real hops** ("Looking up the billing service… Checking who owns it…
  Checking if that's still true…"), using plain text from `labels.ts`, not tool names.
- The answer text in 20px, revealed word-by-word (≈25ms/word, instant under reduced motion).
- A confidence pill = the **lowest** evidence confidence, with the dot colour and the plain label ("Up to date" / "Getting old" / "Probably outdated").
- **"Heads up"** callout when any evidence is stale or `has_gap` / the owner has left, in plain words.
- **"Talk to"** chips for the people named in the answer (initials avatar + name). Clicking opens the PersonCard (Phase 6).
- **"Facts I used"** — collapsible; each fact = one line + dot + "as of {date}"; superseded facts show as
  "replaced by a newer answer" in muted text.
- Actions row: Copy answer · 👍 / 👎 (👎 tries `POST /api/feedback`; if that route 404s, store locally, toast
  "Thanks — noted", and list the missing endpoint in your report).
- Empty state before the first question: a TextType-style greeting ("Ask me how your company works.") and the example chips.
- Error state: plain sentence + Retry button. Never a stack trace, never a spinner that never ends.

Build · commit `phase-3` · **STOP and report if you were only asked for Phases 1–3.**

## PHASE 4 — GRAPH PANEL ("How SPINE found it")

1. Move the Cytoscape view out of `StagePanel` into `GraphPanel.tsx` (keep the proven init fixes: container exists
   before init, solid `--graph-*-bg` colours, no alpha-hex, `cose`/layout settings that don't hang).
2. Idle: a calm, slowly-fitted view of the people↔services neighbourhood, labelled in plain words, with a one-line hint.
3. While asking: nodes and edges appear **hop by hop in sync with the thinking line**, each hop highlighted as it lands.
   Flagged nodes (owner left, stale) get a red ring. Legend uses plain words (Looked at · Found · Needs attention).
4. Click a node → PersonCard / ServiceCard (Phase 6). Hover → name + a plain one-liner.
5. **"Show how I did this"** toggle reveals the real Cypher / tool steps in a mono block — this is the FalkorDB moat, make
   it one click away and good-looking. Copy button on the query.
6. Fit-to-view button, and "Expand" (Phase 6 focus mode).

Build · commit `phase-4`.

## PHASE 5 — VERA PANEL (the signature interaction)

1. **VeraOrb**: pure CSS/SVG glass sphere (no WebGL). Breathes slowly when idle; a second ring pulses every 3s when
   questions are waiting; tinted `#AF52DE`. Reduced motion: static.
2. Header line in plain words: "3 questions need a person." / "Nothing to confirm right now."
3. Each probe is a card (`glass-thin`): the claim in a sentence, who it's for (initials + name), why it matters, and three
   big buttons — **"Yes, still true" · "Something changed" · "I don't know"**. "Something changed" expands a text field.
4. Sending goes through the existing `respond(probeId, text)` with the **human's own words** (Yes → "Yes, that is still correct.").
   Before sending: a 5-second **Undo** toast with a visible countdown; only after it expires does the POST fire.
5. After success: a toast saying what changed in plain words ("Thanks — billing is now owned by Sam. 1 problem fixed."),
   the probe card collapses away, findings/stats refresh, and the finding that was fixed leaves the left panel.
6. "What people told me" — a collapsed history list. If `GET /api/vera/history` is missing, show only this session's answers.
7. Delete `VeraOverlay` and `VeraGlyph` usage (Vera is a panel now, not a modal).

Build · commit `phase-5`.

## PHASE 6 — THE INTERACTION LAYER (what makes it feel alive)

1. **Spotlight hover:** each panel gets a soft light that follows the cursor (CSS variables updated on `pointermove`,
   one shared rAF-free handler). Subtle. Off under reduced motion.
2. **Focus mode:** an expand icon on every panel; the panel grows to fill the grid with a single shared-layout animation,
   the others fade back. `Esc` or the close icon returns. Keyboard accessible, focus trapped.
3. **PersonCard** (side sheet, `glass-strong`, from "Talk to" chips and graph nodes): initials avatar, role, team,
   what they own, whether they've left, and a "Ask Vera to check with them" button (disabled placeholder if no endpoint).
   Uses `GET /api/entity/{id}`; show a skeleton while loading.
4. **Jargon tooltips:** a `<Term>` component that shows the plain definition on hover/focus for every concept a new hire
   might not know (confidence, superseded, owner left, reflex…). Definitions come from `labels.ts`.
5. **First-visit tour** (4 steps, `localStorage` flag `spine-tour-done`, skippable, replay from the top pill's "?"):
   Ask → Answer → What SPINE noticed → Vera. A soft spotlight dims the rest.
6. **Toasts:** one `Toast` system (glass, bottom-centre, stacked, auto-dismiss, `aria-live="polite"`).
7. **Keyboard:** `⌘/Ctrl+K` ask · `1/2/3` focus a panel · `Esc` close · `?` shortcuts sheet.
8. **Micro-feedback:** every button scales `.985` on pointer-down; list rows lift 2px on hover; focus rings are visible.
9. Accessibility pass: every control labelled, headings in order, focus order matches visual order.

Build · commit `phase-6`.

## PHASE 7 — QA, THE DEMO RUN, AND CLEAN-UP

1. **Run the demo script on the live backend and screenshot each step:**
   a. Welcome → press Enter → bento appears (backdrop does not restart).
   b. Ask "Who owns the billing service?" → thinking line → graph walks → answer shows **Sam Okafor, 90%**, Priya listed
      only as "replaced" → "Talk to" chips present.
   c. Open "Show how I did this" → real Cypher visible.
   d. Click a finding on the left → graph highlights it.
   e. Answer a Vera probe with Undo left to expire → toast → the matching finding **disappears** from the left panel.
   f. Ask the same question again → the answer reflects the human's correction.
   g. Click "Scan now" twice → counts do not grow (findings are idempotent).
2. `grep -rn` for raw id patterns rendered in JSX; none may reach the screen. Grep also for `pravatar|unsplash|lorem`.
3. Contrast check on every panel over the brightest part of the backdrop; adjust the scrim, not the text.
4. Performance: scroll and type with the backdrop running — no dropped-frame stutter. If blur is expensive, remove it from
   list rows first (keep it on panels and pills).
5. Kill the backend while open → banner → restart → recovers without reload. Reduced-motion and reduced-transparency
   both produce a still, solid, readable app.
6. Delete dead code (`PulsePanel`, `StagePanel`, `AnswerPanel`, `VeraOverlay`, `VeraGlyph` if now unused), then
   `tsc` · `lint` · `build` clean. Update `README.md` architecture notes in 10 lines.

---

## WHAT I EXPECT BACK (after the last phase you ran)

1. Plain-words summary of what the user now sees.
2. Files added / changed / deleted.
3. The missing backend endpoints you hit (name, shape you expected, where the UI falls back) — this becomes my next backend job.
4. Anything you judged wrong in this document and changed — and why.
5. Screenshots: `/` empty, `/` mid-answer, `/` after the Vera fix.
6. Output of `npx tsc --noEmit`, `npm run lint`, `npm run build`.
