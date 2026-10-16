# STATUS (overwritten after each tier)

Last updated: after TIER 2 (commit `os-2`). Order of work: Tier 1 done earlier, then 4, then 2, then 3.

## Done
- Tier 2 (os-2): right-click engine (`os/context/*`), all menus (wallpaper, title bar, dock, graph person/service/
  document/team/canvas, finding row, answer text, evidence row), confidence-math + why-flagged + person-card popovers,
  Getting started (once per browser, `spine-onboarded`), Settings (motion, wallpaper, layout, person, About),
  Help menu, `askSpine`, `lib/uiPrefs.ts`, `lib/motion.ts` (one reduce-motion flag; Settings toggle feeds it).
  Backend: `/api/claims` now also returns `source_count` (read-only; the input behind the boost).
  Verified in the browser: every menu opens with its items, native menu kept in inputs and with Shift, the math
  popovers multiply out (95% x0.75 x1.00 = 71%; 88% x0.51 x1.00 = 45%), all 6 sample questions complete.
- Tier 1 (os-1): windows, dock, menu bar, Vera bounce + notification.
- Tier 4 (os-4): roles + simulation.
  - Backend: `backend/auth.py` (`current_user`, `require_admin`), `backend/simulate.py`
    (`/api/simulate/{person_leaves,time_passes,docs_conflict,orphan_service,reset}`, admin-only),
    `/api/reflexes/run` and `/api/vera/ask` admin-only, `/api/vera/probes` filtered per person
    and now returns `aimed_at` + `asked_of`.
  - Frontend: `lib/identity.ts` (store + `apiFetch` sending X-Spine-* headers), `components/WhoAreYou.tsx`,
    identity chip + "Switch person" in the menu bar, `os/apps/Simulation.tsx`, role-aware dock/menus,
    `useSpine` got `simulate`, `lastSim`, `probesReady`, debounced probe refresh on each streamed finding.
  - Verified live: viewer gets 403 on simulate/reflexes/vera-ask; Dana (viewer) sees 3 of 12 questions;
    "person leaves" produced new findings with no refresh, Vera icon hopped exactly twice, notification card shown.
  - `tsc`, `lint`, `next build` clean.

## Half-done / not started
- Tier 3 (Directory, Facts, Activity apps): NOT started. Endpoints `/api/people`, `/api/entities`,
  `/api/claims`, `/api/vera/history` already exist. `SimulationRun` nodes exist in the graph for the Activity feed.
- Tier 5: not requested.

## Known bugs / notes
- Person-menu questions ("What does X own?", "What breaks if X leaves?", "Who took over from X?") run, but the answer
  engine only resolves systems, so it answers "no information". Fix belongs in `backend/tools/answer_tools.py`
  (give Person subjects an OWNS-out / blast-radius walk). Not done: Tier 2 only allowed read-only backend changes.
- Wallpaper menu "Wallpaper" mood changes the one canvas's speed/flicker live (no remount).
- "Priya leaves" is impossible: Priya already left in the seed (`left_at` 94 days ago). The button uses the
  active person who owns the most (a dropdown picks anyone else).
- Reset takes ~35 s (re-embeds claims); the graph answers 503 briefly while it rebuilds.
- Backend must run on port **8004** (frontend `.env.local`): `PYTHONPATH=. python -m uvicorn backend.main:app --port 8004`.
- Dev server: `cd frontend && npm run dev` (port 3000). `?layout=reset` restores the window layout.
- Reset also wipes any real Vera answers given before it.
- A viewer's saved layout may mention the admin-only window; it is simply not rendered for them.
