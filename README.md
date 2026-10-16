# SPINE

Answer Engine + Reflex Layer + Vera.

Every other company brain waits to be asked. This one asks you.

## Running it

Backend (FastAPI + FalkorDB):

```bash
pip install -r requirements.txt
PYTHONPATH=. uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

First-time graph setup:

```bash
PYTHONPATH=. python scripts/reset_graph.py && PYTHONPATH=. python scripts/create_schema.py && PYTHONPATH=. python scripts/seed_data.py && PYTHONPATH=. python scripts/embed_claims.py
```

Frontend (Next.js):

```bash
cd frontend && npm install && npm run dev
```

The frontend reads `NEXT_PUBLIC_API_URL` from `frontend/.env.local` (defaults to `http://localhost:8000`).

## Credits

UI components adapted from [Watermelon UI](https://ui.watermelon.sh).

Watermelon UI is released under the **MIT License** ([WatermelonCorp/watermelon-platform](https://github.com/WatermelonCorp/watermelon-platform)), which permits use, copying, modification, merging, publishing, distribution, sublicensing, and sale, including in commercial and closed-source work. The only condition is that the copyright notice and permission notice be retained in copies or substantial portions of the software. It is provided "as is", without warranty.

## Demo identity and the simulation (read this before judging "security")

**Sign-in is a demo, not authentication.** After the welcome screen you pick one of
the company's people and a role (Administrator or Employee). The browser stores that
in `localStorage` (`spine-identity`) and sends it as `X-Spine-Person`, `X-Spine-Role`
and `X-Spine-Name` on every API call. There are no passwords, no tokens and no user
table, and the server believes the headers. What *is* real is that the server, not
just the UI, enforces the split: `/api/reflexes/run`, `/api/vera/ask` and
`/api/simulate/*` answer **403** to anyone who is not an administrator, and
`/api/vera/probes` returns an employee only the questions aimed at them (the people
who own, know about, or are on the team behind the thing being asked about).
`backend/auth.py` is the one place a real identity provider would plug in.

**The Simulation window** (administrators only) replaces a second demo website. Each
scenario makes an honest change to the graph and then runs the ordinary reflexes, so
what SPINE notices is what it would really notice: `person_leaves`, `time_passes`,
`docs_conflict`, `orphan_service`, and `reset`, which rebuilds the seeded company
from `scripts/`. Anything a scenario creates is tagged `simulated: true`. Every
person, service and document in the demo is invented.
