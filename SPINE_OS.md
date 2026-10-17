# SPINE_OS — THE DESKTOP SHELL (windows + dock around what already exists)

Run with **Opus**. Commit after each phase. This is a **frontend-only, thin layer**. It wraps the panels that
`SPINE_BENTO.md` and `SPINE_GRAPH.md` already built. It does not rewrite them.

---

## 0. READ FIRST — PRECONDITIONS (stop if these are false)

1. `SPINE_BENTO.md` Phase 1 is done: all state lives in `app/lib/useSpine.ts`, **not** in the panel components.
2. `SPINE_GRAPH.md` is done: the graph panel is React Flow and looks rich.
3. `npm run build`, `tsc`, `lint` are clean right now.

If 1 or 2 is false, **stop and tell me**. Do not build a pretty shell around a weak graph. The judges score the
graph and the backend first; this shell is the finishing coat, not the foundation.

Also read `SPINE_BENTO.md` §2 (Global Rules). They all still apply. Restated for this job:

- Frontend only. No backend changes.
- No new dependencies. `motion` is already installed and does all the dragging and animation.
- Plain words in the UI. No raw ids. No emoji in the chrome.
- Glass classes only (`.glass`, `.glass-strong`, `.glass-thin`). Dark only. One WebGL canvas (the backdrop), forever.
- Never copy Apple. No Apple logo, no SF Symbols, no "macOS" or "Finder" wording. The product is called
  **SPINE**. The icons are our own (hugeicons or inline SVG). The red/yellow/green window buttons are a generic
  convention and are fine.

---

## 1. THE IDEA

```
 ┌───────────────────────────────────────────────────────────────────────┐
 │ ◆ SPINE   File  View  Window            Scan now   🔴3   You · Admin  10:42 │  ← menu bar (glass-thin)
 ├───────────────────────────────────────────────────────────────────────┤
 │      ░░ animated ASCII wallpaper (the existing backdrop) ░░           │
 │                                                                       │
 │   ┌● ● ●  What SPINE noticed ─┐   ┌● ● ●  How SPINE found it ───────┐  │
 │   │ stats + findings list      │   │  React Flow graph               │  │
 │   └────────────────────────────┘   └─────────────────────────────────┘  │
 │                                    ┌● ● ●  The answer ───────┐ ┌● ● ● Vera ┐
 │                                    └──────────────────────────┘ └────────┘
 │                                                                       │
 │          ╭──────────────────────────────────────────────╮             │
 │          │  Ask  Graph  Noticed  Vera•2  People  Sim     │             │  ← dock (glass)
 │          ╰──────────────────────────────────────────────╯             │
 └───────────────────────────────────────────────────────────────────────┘
```

**The first load must look exactly like the Bento layout** (same five panels, same positions), because every
window starts at a preset position that reproduces it. The OS behaviour (drag, minimize, maximize, dock) is what
is new. So if the shell fails, nothing visible is lost.

**The signature moment:** a question arrives for a person → the **Vera dock icon bounces twice**, its badge pops,
and a small glass notification slides in at the top right: *"Vera is asking Sam: Do you still own billing?"* with
an **Open** button. This is the pitch ("this one asks you") made visible with no explanation.

---

## 2. THE RULE THAT MAKES IT SAFE: WINDOWS OWN NO STATE

Closing, minimizing or dragging a window must never lose data or stop a stream.

- All app state stays in `useSpine` (findings, hops, answer, probes, identity…). Windows are **views**.
- The window manager only stores **window chrome state**: open / minimized / maximized / position / size / z-order.
- **Minimized windows stay mounted** (hidden with `visibility:hidden` + `pointer-events:none`, no layout cost) so the
  React Flow graph keeps its viewport and an in-flight answer keeps animating.
- **Closed windows unmount** their content (cheap), and remount from `useSpine` state when reopened.
- Closing the Ask window mid-answer must not cancel the stream. Prove this in QA.

---

## 3. FILE MAP (create these)

```
app/os/
  OSShell.tsx           top-level: menu bar + desktop area + windows + dock + notifications
  windowStore.tsx       React context + useReducer. NO external state library.
  Window.tsx            one window: chrome + drag + focus + maximize
  TitleBar.tsx          traffic-light buttons + title + optional right slot
  Dock.tsx              dock + magnification + badges + running dots
  DockIcon.tsx
  MenuBar.tsx
  Notifications.tsx     the Vera "asking" banner, 8s auto-dismiss
  presets.ts            default rectangles (in % of the desktop area) = the Bento layout
  windows.config.tsx    registry: id → { title, icon, component, defaultRect, adminOnly, minSize }
  useReducedMotion.ts   if one does not already exist
```

`app/page.tsx` renders `<OSShell/>` on desktop widths and the existing Bento shell below 768px (§9).

---

## PHASE O1 — WINDOW MANAGER CORE

### State (per window)

```ts
type WinState = {
  id: WindowId;            // 'ask' | 'graph' | 'noticed' | 'answer' | 'vera' | 'people' | 'simulation'
  open: boolean;
  minimized: boolean;
  maximized: boolean;
  rect: { x: number; y: number; w: number; h: number };  // px, derived from % presets
  z: number;               // incrementing counter; focused = highest
};
```

Actions: `open`, `close`, `minimize`, `restore`, `toggleMaximize`, `focus`, `move`, `resetLayout`, `hydrate`.

### Behaviour (all of it, nothing more)

- **Focus:** pointer-down **anywhere** on a window raises it (use capture so inner buttons still work).
  Focused window uses `.glass-strong`; unfocused use `.glass` and a slightly dimmer title.
- **Drag:** `motion` `drag` with `dragListener={false}` and `dragControls`; only the **title bar** starts a drag.
  This is what stops the window drag from fighting React Flow's own pan. `dragMomentum={false}`,
  `dragElastic={0}`. Constrain so **at least 80px of the title bar always stays on screen** and the title bar can
  never go under the menu bar or behind the dock.
- **Maximize** (green button or double-click the title bar): animate to fill the desktop area (between menu bar and
  dock, 12px margin). Toggle again restores the previous rect. One layout animation, 300ms, bounce 0.
- **Minimize** (yellow): animate scale → 0.2 and translate toward the **dock icon's** `getBoundingClientRect()`,
  fade out, 260ms. Restore reverses it. No genie warp; keep it a simple scale+translate.
- **Close** (red): fade/scale to .96, unmount content. Reopen from the dock.
- **No free resize.** Windows have fixed sizes (maximize is the only size change). Do not build edge or corner
  resizing. If I want it later I will ask.
- **No snapping, no multiple desktops, no window tabs.**
- **Persist:** save `{open, minimized, maximized, rect}` per window to `localStorage` key `spine-os-layout-v1`,
  wrapped in try/catch. `?layout=reset` and **Window → Reset layout** restore the preset.
- **Resize of the browser:** presets are percentages of the desktop area, recomputed on resize (debounced 120ms);
  custom-dragged windows are re-clamped into view, never left off-screen.
- **Max 7 windows exist; at most 4 are open by default.** (See §10, blur cost.)

### Traffic lights

12px circles, 8px gap, left of the title: red `#FF5F57`, yellow `#FEBC2E`, green `#28C840`. Glyphs (×, –, ⤢) fade
in when the **group** is hovered or focused. When the window is unfocused the lights desaturate to grey. Each is a
real `<button>` with an `aria-label` ("Close The answer", "Minimize…", "Maximize…"), 24px hit area.

Commit `os-1`.

---

## PHASE O2 — DOCK AND MENU BAR

### Dock (glass pill, fixed bottom centre, 12px from the edge)

Items, left to right: **Ask · The graph · What SPINE noticed · Vera** | divider | **People · Simulation**
(the last two **admin only**; see §7).

- Icons: 52px rounded-square glass tiles with our own simple line icon each. No Apple look-alikes.
- **Magnification:** neighbours scale up to 1.5× by cursor distance (`useMotionValue` + `useTransform`, spring,
  bounce 0). Disabled on touch and under reduced motion.
- **Tooltip:** plain label above the icon on hover/focus ("Ask a question", "How SPINE found it",
  "What SPINE noticed", "Vera", "People", "Simulation").
- **Running dot** under the icon when the window is open; a hollow dot when minimized.
- **Click rules:** closed → open + focus. Minimized → restore + focus. Open but not focused → focus. Focused →
  small "nudge" (scale 1.08 and back); do **not** minimize.
- **Badges** (count, red pill, top-right of icon): Vera = open questions **aimed at the current person**
  (admins: all). What SPINE noticed = number of 🔴-level findings (render a red dot, not an emoji). Hide at 0.
- Keyboard: dock is a `role="toolbar"`, arrow keys move between icons, Enter activates.

### Menu bar (glass-thin, 32px, fixed top)

Left: **SPINE** logo mark + menu items **File · View · Window**. Right: **Scan now** button (existing action, shows
a spinner while scanning), health pill (red/green dot + "3 need attention"), the identity chip (initials, name,
role, "Switch person"), and a clock (24h, local).

- **File:** Ask a question (⌘/Ctrl+K), Scan now, Run the demo (stretch; see O8), Switch person.
- **View:** Show all windows, Tidy windows (reset layout), Hide all windows.
- **Window:** list of every window with a ✓ on open ones; click to open/focus.
- Menus open on click, close on outside click or Escape, are keyboard navigable.
- Shortcuts: **Ctrl/⌘+K** → open + focus Ask and its input. **Alt+1…6** → open/focus windows. **Esc** closes menus
  only (never closes a window).

Commit `os-2`.

---

## PHASE O3 — TURN THE EXISTING PANELS INTO WINDOWS

Register each existing component in `windows.config.tsx`. Components receive the same props they get in the Bento
shell, from `useSpine()`. **Do not edit panel internals** except to remove the Bento `<Panel>` wrapper's own
title (the window title bar replaces it).

| Window | Content | Default rect (% of desktop area) | Opens by default |
|---|---|---|---|
| **What SPINE noticed** | stats strip + chips + findings list | x 1, y 2, w 24, h 96 | yes |
| **How SPINE found it** | the React Flow graph | x 26, y 2, w 48, h 56 | yes |
| **The answer** | answer + evidence | x 26, y 60, w 48, h 38 | yes |
| **Ask** | the ask bar | floating capsule: x 26, y 2, w 48, h auto, **no title bar; see below** | yes |
| **Vera** | orb + questions + 3 buttons | x 75, y 2, w 24, h 96 | yes |
| **People** | list from `/api/people`, owners, who left | x 30, y 10, w 40, h 70 | no (admin) |
| **Simulation** | scenario buttons + live findings | x 30, y 10, w 40, h 70 | no (admin) |

**Ask window exception:** to avoid a window sitting on top of the graph, the Ask window is a compact glass capsule
(no traffic lights, but it still raises on click, can be dragged by a small grip on its left edge, and has the
dock icon). Its default position is the top of the centre column; shift the graph and answer windows down by its
height. If this is awkward, instead make Ask a normal window pinned at x 26, y 2, h 12 and shrink graph/answer
accordingly. Pick whichever looks better and tell me which.

- Graph window title-bar right slot: **Fit · Show how I did this · Expand** (Expand = maximize).
- When a question is asked and the **graph window is minimized or closed**, open and focus it automatically (the
  hop-by-hop animation is the demo). When the answer lands and **the answer window is closed**, open it.
- When the graph window is **maximized** during streaming, the answer window stays visible as a floating
  `glass-strong` strip pinned bottom-centre above the dock (collapsed to the final answer text + a "View evidence"
  button). Do not leave a maximized graph hiding the answer.

Commit `os-3`.

---

## PHASE O4 — THE VERA MOMENT (the memorable part)

Watch the probe count / list from `useSpine`.

1. When a **new** probe appears (count rises, or a new id), and it is aimed at the current person (admins: any):
   - **Dock bounce:** Vera icon hops 18px up and down **twice** (spring, 600ms total), once per new probe, never
     looping. The badge pops (scale 0 → 1.15 → 1).
   - **Notification** slides in top-right under the menu bar: glass-strong card, Vera orb mini-icon, one plain line
     (*"Vera is asking Sam: Do you still own the billing service?"*), buttons **Open** and **Later**. Auto-dismisses
     after 8 seconds (pause the timer on hover). Max 3 stacked; older ones collapse.
2. **Open** → opens + focuses the Vera window and scrolls to that question.
3. If the Vera window is already focused, skip the notification and just highlight the new row for 2 seconds.
4. When Vera's 5-second Undo window is active (from SPINE_BENTO Phase 5), the notification area must not cover it.
5. Reduced motion: no bounce; the badge simply updates and the notification fades in.

This must work with a **live** event (e.g. from the Simulation tab or `POST /api/reflexes/run`), not only on page
load. Prove it with a screen recording or sequential screenshots.

Commit `os-4`.

---

## PHASE O5 — ROLES IN THE SHELL

Depends on `SPINE_V2.md` Job 2 (demo identity). Check whether `localStorage` `spine-identity` and the
`X-Spine-Role` headers exist.

- If they exist: **People** and **Simulation** dock icons and menu items appear only for `role === 'admin'`. A
  viewer sees only Ask, The graph, What SPINE noticed (read-only), Vera (only their own questions). Server-side 403s
  are already enforced; the UI just does not offer what the user cannot do.
- If they do **not** exist: hide People and Simulation entirely, leave a one-line note in your report ("waiting on
  Job 2"), and do not invent auth.
- Switching person in the menu bar re-filters Vera and the badge immediately, with no page reload.

Commit `os-5`.

---

## PHASE O6 — MOBILE, MOTION, PERFORMANCE, A11Y

- **Below 768px:** do not render `OSShell`. Render the existing SPINE_BENTO mobile layout (segmented control). No
  floating windows on phones, ever.
- **768–1100px:** render OSShell but open only the graph and the answer by default; the left and right windows start
  minimized.
- **Reduced motion:** no dock magnification, no bounce, no minimize travel (cross-fade only), no drag inertia.
- **Reduced transparency:** the existing glass fallbacks apply; verify windows stay readable.
- **Blur cost (important):** every open window has a backdrop blur over a live WebGL wallpaper.
  - Never animate `backdrop-filter` or the glass background; animate only transform, opacity, box-shadow.
  - While a window is being dragged, add `will-change: transform` and nothing else; remove it on drop.
  - If measured frame rate drops under 50fps with 4 windows open, switch **unfocused** windows to `.glass-thin`
    (smaller blur radius) and tell me.
- **A11y:** every window `role="group"` with `aria-label` = its title; traffic lights are labelled buttons; all
  interactive elements reachable by Tab in a sensible order; focus ring visible; contrast ≥ 4.5:1 on window titles.
- No text selection while dragging (`user-select: none` on the title bar only).

Commit `os-6`.

---

## PHASE O7 — QA (do not report done until every line is true)

1. First load after the welcome flow shows the **Bento layout** (same positions), windows fade in with a 60ms stagger.
2. Each window can be dragged by its title bar only; dragging the graph canvas pans the graph, **not** the window.
3. A window can never be dragged so far that its title bar is unreachable.
4. Yellow button animates the window into its dock icon; clicking that icon restores it with state intact
   (graph viewport and answer text unchanged).
5. Green button / double-click maximizes and restores to the exact previous rect.
6. **Closing the Ask or answer window during a streaming answer does not interrupt it**; reopening shows the
   completed answer.
7. Asking a question while the graph window is closed opens it, and the hop-by-hop animation runs.
8. The Vera dock icon bounces exactly twice per new question and the notification appears and auto-dismisses; no
   infinite loops anywhere in the shell.
9. Refresh restores the last layout; `?layout=reset` restores the preset.
10. Resize the browser from 1920 → 1200 → 900 wide: windows re-fit, none stranded off-screen.
11. At 600px width the Bento mobile layout renders instead of the shell.
12. Reduced motion verified.
13. Four windows open, the wallpaper running: scrolling/dragging holds ≥ 50fps (report the number from the
    Performance panel).
14. `tsc`, `lint`, `npm run build` clean; 0 Next.js dev issues; no new dependencies in `package.json`.
15. The trust rule and every API call are untouched (this is frontend only; show `git diff --stat` proving no
    backend file changed).

**Screenshots to include in the report:** (a) desktop on first load, (b) a window mid-drag, (c) graph maximized
mid-answer with the answer strip visible, (d) a window minimized with the dock showing the hollow dot, (e) the
Vera notification with the dock icon bounced up (take it from a live event), (f) the 600px mobile fallback.

Commit `os-7`.

---

## PHASE O8 — OPTIONAL STRETCH (only if O1–O7 are fully done and verified)

**Demo director:** File → *Run the demo* (admin only) plays a short scripted sequence so the recording is repeatable:

1. Resets the layout. 2. Opens Simulation, runs `person_leaves` (existing endpoint), watches the new findings land.
3. The Vera icon bounces; the notification appears. 4. Auto-asks "Who owns the billing service?" and lets the
graph animate. 5. Stops with the answer visible.

Every step uses the real buttons/endpoints (no fake data) with 1.2s pauses, a visible "Demo running · Stop" pill,
and Esc cancels it. Skip this if Jobs 4 and 5 of `SPINE_V2.md` are not done.

---

## REPORT FORMAT

1. What changed, in plain words (5 lines max).
2. Files created / touched.
3. Anything that fought back (drag vs React Flow, blur cost, z-index, hydration).
4. Exactly what to click to see: drag, minimize, maximize, the Vera bounce.
5. The QA checklist with ✅/❌ per line, plus the 6 screenshots, plus `tsc` / `lint` / `build` output.
