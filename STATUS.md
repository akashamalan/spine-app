# STATUS (overwritten after each tier)

Last updated: end of the run (Tiers 4, 2, 3 done; Tier 5 not started). Commits: os-1, os-4, os-2, os-3.

## Done
- Tier 1 (os-1): windows (drag by title bar, minimize into the dock, maximize, saved layout), React Bits dock,
  menu bar, Vera bounce + notification.
- Tier 4 (os-4): demo roles (`backend/auth.py`, `lib/identity.ts`, `components/WhoAreYou.tsx`), admin-only
  `/api/reflexes/run`, `/api/vera/ask`, `/api/simulate/*` (real 403 for viewers), per-person Vera inbox,
  Simulation window (`os/apps/Simulation.tsx`, `backend/simulate.py`), Reset rebuilds the seed (~35 s).
- Tier 2 (os-2): right-click engine + every menu (`os/context/*`), confidence-math / why-flagged / person popovers,
  Getting started (once per browser), Settings, Help menu, `lib/uiPrefs.ts`, `lib/motion.ts`.
- Tier 3 (os-3): Directory, Facts, Activity windows (`os/apps/*`), `lib/useVeraHistory.ts`.
  Facts: least trusted first, replaced facts labelled, dock badge = "probably outdated". Activity (admin only): findings,
  Vera questions, each person's raw words next to the replaced fact + "Only a person's answer changed this fact."
  Directory and Facts are for everyone; Activity and Simulation are admin-only.
- Read-only backend additions: `/api/claims` -> `source_count`; `/api/entities` now includes Documents (+ created_at, tier);
  `/api/vera/history` -> `asked_at`, `subject_id`, `claim_id`; admin `GET /api/simulate/history`;
  recorded answerers are names (`_who`), never ids.
- Checks at the end of the run: `tsc` clean, `lint` clean, `next build` clean. The graph was left at the clean seed.

## Half-done / not started
- Tier 5 (Query console, Demo director): not started (not requested).
- Nothing hidden: every app had real data.

## Known bugs / notes
- Person-menu questions ("What does X own?", "What breaks if X leaves?", "Who took over from X?") run, but the answer
  engine only resolves systems, so it replies "no information". Fix in `backend/tools/answer_tools.py` (give Person
  subjects an OWNS-out / blast-radius walk). Not done: only read-only backend changes were allowed.
- "Priya leaves" is impossible: Priya already left in the seed. The Simulation button uses whoever owns the most.
- Reset wipes real Vera answers too. It takes ~35 s and the graph answers 503 briefly.
- Backend must run on port 8004 (frontend `.env.local`): `PYTHONPATH=. python -m uvicorn backend.main:app --port 8004`.
  Frontend: `cd frontend && npm run dev` (port 3000). `?layout=reset` restores the window layout.
- The Vera notification card sits top-right and covers the top of the Vera list for up to 8 s.
- Activity "SPINE noticed" times are the last time a scan re-confirmed a finding (reflexes refresh `found_at`).
