# STATUS (overwritten after each tier)

Last updated: after TIER 4 (commit `os-4`). Order of work: Tier 1 done earlier, then 4, then 2, then 3.

## Done
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
- Tier 2 (right-click menus, confidence-math popover, Getting started, Settings): NOT started.
- Tier 3 (Directory, Facts, Activity apps): NOT started. Endpoints `/api/people`, `/api/entities`,
  `/api/claims`, `/api/vera/history` already exist. `SimulationRun` nodes exist in the graph for the Activity feed.
- Tier 5: not requested.

## Known bugs / notes
- "Priya leaves" is impossible: Priya already left in the seed (`left_at` 94 days ago). The button uses the
  active person who owns the most (a dropdown picks anyone else).
- Reset takes ~35 s (re-embeds claims); the graph answers 503 briefly while it rebuilds.
- Backend must run on port **8004** (frontend `.env.local`): `PYTHONPATH=. python -m uvicorn backend.main:app --port 8004`.
- Dev server: `cd frontend && npm run dev` (port 3000). `?layout=reset` restores the window layout.
- Reset also wipes any real Vera answers given before it.
- A viewer's saved layout may mention the admin-only window; it is simply not rendered for them.
