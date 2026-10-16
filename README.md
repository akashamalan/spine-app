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
