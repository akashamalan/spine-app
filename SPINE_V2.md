# SPINE V2 — BACKEND, ROLES, AND THE DEMO ENGINE

Run this **before** any visual work. `SPINE_LOOK.md` comes after.
Work job by job. After each job, stop and give me the Job Report.

Project root: `C:\Users\akash\OneDrive\Desktop\spine-app`

---

## 0. WHAT EXISTS TODAY (I checked — do not re-survey)

Backend (`backend/main.py`, 31KB) currently serves:

| Route | Purpose |
|---|---|
| `GET /health` | liveness |
| `GET /api/graph/stats` | node/edge counts |
| `GET /api/findings/stream` | SSE of findings |
| `POST /api/ask` | answer engine (LLM routing + evidence) |
| `GET /api/findings` | reflex findings |
| `POST /api/reflexes/run` | run patrol agents |
| `GET /api/vera/probes` | Vera's open questions |
| `POST /api/vera/respond` | human answer → Layer 2 write |
| `GET /api/entity/{id}` | one entity |

Frontend is a three-pane "control room": `page.tsx` + `PulsePanel`, `StagePanel`,
`AnswerPanel`, `VeraOverlay`, `VeraGlyph`, `ThemeToggle`, `WelcomeScreen`.

`frontend/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:8004`.

---

## JOB 1 — MAKE THE WELCOME SCREEN ACTUALLY WORK

`WelcomeScreen.tsx` and its `.welcome-*` CSS in `globals.css` both exist and look
correct on paper, so the failure is at runtime. Diagnose it properly — **do not
rewrite the component before you know why it fails.**

Do this in order:

1. Run `npm run dev`, open `http://localhost:3000`, and read the **browser console**
   and the **terminal** output. Report the actual error text to me.
2. Check these specific suspects and tell me which one it was:
   - `tsconfig.json` `include` lists only `**/*.ts`, `**/*.tsx`, `**/*.mts` — it does
     **not** list `**/*.jsx`. `GradientASCII.jsx` is a `.jsx` file. Confirm whether
     Turbopack still resolves it; if not, add `"**/*.js"` and `"**/*.jsx"` to `include`.
   - `GradientASCII` needs **WebGL2**. If `canvas.getContext('webgl2')` returns null the
     component silently renders nothing and you get a black screen with no error.
     Add a visible CSS-gradient fallback so it degrades instead of dying.
   - `dynamic(() => import("./GradientASCII"), { ssr: false })` with a **named vs default**
     export mismatch renders nothing. Verify the default export resolves.
   - `.welcome-screen` is `position: fixed; z-index: 100` — confirm nothing in
     `globals.css` later creates a stacking context above it.
3. Then fix it, and make the flow work end to end:
   - Welcome screen fills the viewport on load.
   - **"Enter Control Room"** and the Enter/Space keys both work.
   - It fades out and the main panel appears. No flash, no scrollbar jump.
   - It shows **once per browser** — store `spine-seen-welcome` in `localStorage`,
     wrapped in try/catch. Add `?welcome=1` to force it back for demo recording.
4. Keep the exact GradientASCII settings that are already in the file. They are mine.

**Report:** the real cause in one sentence, the fix, and the files touched.

---

## JOB 2 — ROLES: ADMIN AND VIEWER

Two kinds of people use SPINE inside a company.

```
   ADMIN  (company administrator)        VIEWER  (any employee)
   ─────────────────────────────         ──────────────────────
   Ask                                    Ask
   Health   — all problems                Vera   — only questions aimed at them
   Vera     — the whole inbox             (that's it)
   People   — who owns what
   Simulation  (Job 4)
   Reset / Run Reflexes
```

**This is demo auth, not real auth. Say so in the README.** No passwords, no JWT, no
user table. We are not shipping a login system in two days and judges do not score it.

How it works:

- On the welcome screen, after the CTA, show a second step: **"Who are you?"** with the
  seeded people from the graph plus a role toggle. Pick one → store
  `{ personId, name, role }` in `localStorage` under `spine-identity`.
- Every API call sends headers `X-Spine-Person` and `X-Spine-Role`.
- FastAPI gets one dependency, `current_user(request)`, that reads those headers and
  returns `{person_id, name, role}`, defaulting to an anonymous viewer.
- Admin-only routes return **403** for viewers. Enforce it **on the server**, not just by
  hiding buttons: `/api/reflexes/run`, `/api/simulate/*`, `/api/admin/*`.
- `GET /api/vera/probes` filters by person for viewers, returns everything for admins.
- Add a small identity chip in the corner of the app: avatar initials, name, role, and
  "Switch person" for the demo.

---

## JOB 3 — BACKEND HARDENING

This is where the hackathon is actually won. Judges read the graph work, not the CSS.

### 3.1 Ranking correctness (highest priority)

1. A claim with an incoming `SUPERSEDES` edge is **never** returned as a current fact.
   It may appear only in history, labelled "replaced".
2. Rank retrieval by `similarity × live_confidence`, not similarity alone.
3. Prove it: `who owns the billing service?` must put the 90% claim first and must not
   show the 9% superseded one as current. Paste me the before/after output.

### 3.2 New endpoints the UI needs

| Route | Returns |
|---|---|
| `GET /api/people` | every Person: id, name, role, team, initials, what they own, whether they've left |
| `GET /api/entities` | lightweight list for `@` mentions and autocomplete |
| `GET /api/claims` | all live claims with `base_conf`, `asserted_at`, `half_life`, computed live confidence |
| `POST /api/feedback` | 👎 on an answer → a `user_doubt` Finding + a VerifyTask |
| `GET /api/vera/history` | answered probes, newest first, with the human's raw words |
| `POST /api/vera/ask` | admin asks Vera to verify specific claims now |

### 3.3 Make it not fall over

- Every route wrapped so a FalkorDB or Groq failure returns a **clean JSON error with a
  real message**, never a 500 HTML page. The frontend must be able to show
  "I couldn't reach the graph" instead of hanging.
- If `GROQ_API_KEY` is missing or expired, `/health` says so explicitly in its payload.
  Silent template fallbacks cost us a day already.
- Timeout every LLM call at 20s with a usable fallback answer.
- One `structlog`-style line per request: route, person, role, ms, outcome.
- `GET /api/graph/stats` also returns counts of findings by severity and open VerifyTasks.

### 3.4 Keep the trust rule intact

Reflexes write **only** Layer 3. The only path that changes Layer 2 is a human answer
arriving through `/api/vera/respond`, with the person's raw words stored on the Response
node, old claims superseded and never deleted. Do not weaken this for convenience —
it is the single idea that makes SPINE different from a RAG chatbot.

---

## JOB 4 — THE SIMULATION PANEL (this replaces the second website)

You asked for a separate website that simulates a company so the demo video has
something to show. **Don't build a second website.** It doubles the work, it has to be
deployed and kept in sync, and in the video the judge sees two browser tabs and loses
the thread.

Build it as an **admin-only "Simulation" tab inside SPINE**. Same graph, same backend,
one tab to record, and the cause and the effect sit on the same screen — which is a
far better story:

```
  ┌─ SIMULATION (admin only) ─────────────────────────┐
  │                                                     │
  │   [ Priya leaves the company        ]  ← one click  │
  │   [ Six months pass                 ]               │
  │   [ Two documents start disagreeing ]               │
  │   [ A new service appears, unowned  ]               │
  │                                                     │
  └─────────────────────────────────────────────────────┘
            │
            ▼  watch, live, on the same screen
  ┌─ WHAT SPINE NOTICED ──────────────────────────────┐
  │  🔴 Nobody looks after billing-service             │
  │  🟠 The deploy guide is probably outdated          │
  │  💬 Vera is asking Sam: "Do you still own this?"   │
  └─────────────────────────────────────────────────────┘
```

Backend: `POST /api/simulate/{scenario}`, admin-only, scenarios
`person_leaves`, `time_passes`, `docs_conflict`, `orphan_service`.

Each one:
- makes an **honest** change to Layer 1 / Layer 2 (set `left_at` on a Person; shift
  `asserted_at` backwards; add a contradicting Document; add a Service with no owner),
- then runs the reflexes,
- then returns what changed and what was found.

Rules:
- Every simulated node gets `simulated: true` so it can be cleanly removed.
- `POST /api/simulate/reset` restores the seeded demo state
  (`reset_graph` → `create_schema` → `seed_data` → `embed_claims`).
- The findings stream must push the new findings live — the viewer should see them
  land without a refresh. That moment is the demo.
- This is synthetic data about invented people. It satisfies hackathon rule 6; say so
  in the README.

---

## JOB 5 — SEED A COMPANY WORTH DEMOING

The current seed (57 nodes) is too small to feel like a company. Grow it to roughly
**12 people, 10 services, 15 documents, 3 teams**, still fully synthetic and invented.
Plant exactly these faults so each Health category has something real to show:

| Fault | Planted as |
|---|---|
| Only one person knows this | one service, one owner, no deputy |
| Nobody looks after this | one service whose owner has `left_at` set |
| This might be outdated | a deploy doc asserted 14 months ago |
| Two documents disagree | two runbooks with opposite rollback steps |
| The owner has left | ownership claim pointing at a departed person |

Keep `scripts/seed_data.py` the single source of truth. No fault may be hardcoded in
the frontend.

---

## ORDER AND STOPPING POINTS

```
 JOB 1  welcome works            ← tonight
 JOB 3  backend hardening        ← tonight / tomorrow morning   ★ most important
 JOB 5  bigger seed
 JOB 2  roles
 JOB 4  simulation panel         ← this is the demo video
 ─────────────────────────────────────────────
 then SPINE_LOOK.md              ← only if the above is done and solid
```

Do **not** start the visual work until Jobs 1–5 are done and I've seen them run.
A beautiful app that answers wrong loses. A plain app that catches a stale fact live
on stage wins.

---

## JOB REPORT (after every job)

1. What changed, in plain words.
2. Files touched.
3. What fought back.
4. Exactly what I click to see it working.
5. For Jobs 3 and 4: the actual request/response output, pasted.
