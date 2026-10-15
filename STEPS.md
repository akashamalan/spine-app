# SPINE — Step-by-Step Build Guide

Every step below = one Claude Code prompt.
Each one does ONE small thing. Read the "WHY" so you know what it's doing.

---

## PHASE 0: GET THE CODE TO YOUR MACHINE

### Step 0.1 — Download the spine-app folder
**WHY:** All the code lives in this cloud session. You need it on your laptop.
**HOW:** Download the `spine-app` folder I'll send you, or clone from the repo once we push it.

---

## PHASE 1: DATABASE SETUP (FalkorDB Cloud)

You need a graph database. FalkorDB Cloud gives one free.

### Step 1.1 — Sign up for FalkorDB Cloud
**WHY:** SPINE stores all knowledge as a graph (nodes = people, systems, claims; edges = who owns what, who wrote what). We need a place to put that graph. FalkorDB Cloud gives you a free graph database with a URL you can connect to.
**DO:** Go to https://app.falkordb.cloud — sign up — create a free database — copy the host, port, and password.

### Step 1.2 — Fill in .env with your FalkorDB credentials
**WHY:** The backend reads `.env` to know where the database lives. Without this, nothing connects.
```
PROMPT: Open the file .env in spine-app. Replace FALKORDB_HOST with [your host], FALKORDB_PORT with [your port], FALKORDB_PASSWORD with [your password]. Keep FALKORDB_GRAPH as "spine".
```

### Step 1.3 — Get a Groq API key
**WHY:** Groq gives us free access to fast LLMs (Llama 3.3). SPINE uses it to extract facts from documents and detect contradictions. Without it, the answer engine still works (graph-only mode) but can't do smart extraction.
**DO:** Go to https://console.groq.com — sign up — create API key — paste it in .env as GROQ_API_KEY.

---

## PHASE 2: INSTALL DEPENDENCIES

### Step 2.1 — Install Python backend packages
**WHY:** The backend needs FastAPI (web server), falkordb (database client), numpy (math for embeddings), uvicorn (runs the server).
```
PROMPT: In the spine-app folder, run: pip install -r requirements.txt
```

### Step 2.2 — Install frontend packages
**WHY:** The frontend needs Next.js (React framework), Cytoscape.js (draws graphs), Tailwind CSS (styling).
```
PROMPT: In the spine-app/frontend folder, run: npm install
```

---

## PHASE 3: CREATE THE GRAPH SCHEMA

### Step 3.1 — Run the schema creation script
**WHY:** Before we put data in the graph, we need to tell FalkorDB what kinds of things exist and how to search them. This creates:
- Vector indexes (so we can search claims by meaning, not just keywords)
- Fulltext indexes (so we can search by name/title)
- Range indexes (so we can filter by date)
```
PROMPT: In spine-app, run: PYTHONPATH=. python scripts/create_schema.py
```
**EXPECT:** It should print "Created X indexes" with no errors. If it says "connection refused" → your .env credentials are wrong.

---

## PHASE 4: LOAD THE DEMO DATA

### Step 4.1 — Run the seed data script
**WHY:** This loads a fake company called "Northwind Engineering" into the graph. It has 10 documents, 8 people, 8 systems, and 16 claims. Most importantly, it has **5 planted faults** that SPINE's reflex agents will find:
1. **Bus factor** — billing-service has only 1 owner (Priya) and she left the company
2. **Orphan system** — legacy-auth has no owners and nothing depends on it
3. **Truth decay** — deploy process claims are 311 days old (past their expiry)
4. **Contradiction** — two claims disagree about how rollbacks work
5. **Missing owner gap** — billing-service ownership edge has an end date (gap)
```
PROMPT: In spine-app, run: PYTHONPATH=. python scripts/seed_data.py
```
**EXPECT:** Should print counts of created nodes/edges. No errors.

### Step 4.2 — Generate embeddings for all claims
**WHY:** So the vector search works. Each claim gets turned into a 384-number array that represents its meaning. Similar claims = similar numbers = they show up when you search.
```
PROMPT: In spine-app, run: PYTHONPATH=. python scripts/embed_claims.py
```
**EXPECT:** Should say "Embedded X claims."

### Step 4.3 — (Optional) Enable neural embeddings
**WHY:** The default embeddings use a hash trick (works offline). Real neural embeddings from MiniLM are better at understanding meaning. Only do this if your machine can download from HuggingFace.
```
PROMPT: In .env, set USE_NEURAL_EMBEDDINGS=1. Then run: pip install sentence-transformers. Then re-run: PYTHONPATH=. python scripts/embed_claims.py
```

---

## PHASE 5: START THE BACKEND

### Step 5.1 — Start the FastAPI server
**WHY:** This is the brain. It handles all the API calls — asking questions, running reflexes, streaming findings, Vera probes. The frontend talks to this.
```
PROMPT: In spine-app, run: PYTHONPATH=. uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
**EXPECT:** Should say "FalkorDB connected" and "Uvicorn running on http://0.0.0.0:8000"

### Step 5.2 — Test the health endpoint
**WHY:** Quick check that everything connected properly.
```
PROMPT: In a new terminal, run: curl http://localhost:8000/health
```
**EXPECT:** Should return something like `{"status":"ok","nodes":52,"edges":68}`

### Step 5.3 — Test running the reflex agents
**WHY:** This triggers the 3 patrol agents (bus factor scanner, orphan hunter, decay watchman). They scan the graph and create Finding nodes for the 5 planted faults.
```
PROMPT: Run: curl -X POST http://localhost:8000/api/reflexes/run
```
**EXPECT:** Should return findings for bus_factor, orphan, and decay. This proves the core demo works.

---

## PHASE 6: START THE FRONTEND

### Step 6.1 — Start the Next.js dev server
**WHY:** This is the UI — the three-pane control room where you see findings, ask questions, and talk to Vera.
```
PROMPT: In spine-app/frontend, run: npm run dev
```
**EXPECT:** Opens on http://localhost:3000

### Step 6.2 — Set the API URL for the frontend
**WHY:** The frontend needs to know where the backend is. In dev it's localhost:8000.
```
PROMPT: In spine-app/frontend, create a .env.local file with: NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## PHASE 7: IMPROVE THE FRONTEND (Particle by particle)

Now the app runs. But the UI needs polish for the hackathon demo. Each step below is one specific visual change.

### Step 7.1 — Add a Cytoscape.js graph to the Stage panel
**WHY:** Right now the Stage shows hops as cards. For the demo, we want to actually SEE the graph — nodes and edges appearing as SPINE walks through them. Cytoscape.js is already installed.
```
PROMPT: In frontend/app/components/StagePanel.tsx, add a Cytoscape.js graph visualization. When hops come in, add their nodes and edges to the graph. Use the SPINE color tokens (--accent for edges, --ink for nodes, --signal for flagged nodes). The graph should animate as new hops arrive — each new node slides in. Keep the existing hop cards below the graph as a log.
```

### Step 7.2 — Add confidence bars to the Answer panel
**WHY:** Each claim has a confidence score (truth decay). Showing colored bars (green = fresh, yellow = aging, red = stale) makes it visual and dramatic for the demo.
```
PROMPT: In frontend/app/components/AnswerPanel.tsx, for each claim in the answer, show a horizontal confidence bar. Green (#11674A) for 80%+, yellow (#7A5600) for 60-80%, red (#A33318) for below 60%. Show the percentage number next to the bar. Add a small ⚠ icon next to stale claims.
```

### Step 7.3 — Add pulse animation to new findings in PulsePanel
**WHY:** When a new finding arrives via SSE, it should feel alive — a brief glow or pulse so the user notices it.
```
PROMPT: In frontend/app/components/PulsePanel.tsx, when a new finding appears at the top of the list, give it a 2-second glow animation using the signal-soft color. The finding card should slide in from the left with a 0.3s ease-out animation.
```

### Step 7.4 — Make Vera's glyph breathe when dormant
**WHY:** Vera is the outreach agent. Even when she has no questions, her icon should slowly pulse (like breathing) to show she's alive and watching. When she has questions, the pulse speeds up.
```
PROMPT: The VeraGlyph component already has CSS animations defined in globals.css (vera-dormant, vera-waking, vera-speaking). Make sure the SVG circle in VeraGlyph.tsx scales slightly during the vera-dormant animation. When state is "speaking", add a subtle glow ring around the button using box-shadow with the accent color.
```

### Step 7.5 — Add a "time ago" live counter to findings
**WHY:** Findings show "2m ago" but it's static. For the demo, we want it to tick live ("2m ago" → "3m ago") so the Pulse feels real-time.
```
PROMPT: In PulsePanel.tsx, make the timeAgo display update every 30 seconds using a setInterval inside a useEffect. Each finding's timestamp should re-render without re-mounting the whole list.
```

### Step 7.6 — Add empty state illustrations
**WHY:** When the app first loads (no findings, no question asked), the panels should look intentional, not broken. The empty states need to guide the user.
```
PROMPT: The StagePanel already has an empty state with a bone emoji. Make the PulsePanel empty state show a radar/satellite dish icon (📡) with "Listening for findings..." text pulsing slowly. The AnswerPanel empty state should show "Ask a question to see answers here" centered vertically.
```

### Step 7.7 — Add keyboard shortcut: Enter to ask
**WHY:** During the demo you want to type and hit Enter fast. The input already has onKeyDown for Enter, but we should also add Cmd+K / Ctrl+K to focus the input from anywhere.
```
PROMPT: In page.tsx, add a global keyboard listener. When the user presses Cmd+K (Mac) or Ctrl+K (Windows), focus the question input. Show a small "⌘K" hint text inside the input placeholder.
```

---

## PHASE 8: DEPLOY

### Step 8.1 — Deploy backend to Railway
**WHY:** Railway gives you a free server to run the Python backend. The hackathon judges need to see it live.
```
PROMPT: Create a Procfile in spine-app with: web: uvicorn backend.main:app --host 0.0.0.0 --port $PORT. Create a runtime.txt with: python-3.12. Make sure requirements.txt has all deps. Then deploy to Railway.
```

### Step 8.2 — Deploy frontend to Vercel
**WHY:** Vercel runs Next.js for free. It auto-deploys from git.
```
PROMPT: In spine-app/frontend, set NEXT_PUBLIC_API_URL to your Railway backend URL in the Vercel environment variables. Deploy via: npx vercel --prod
```

### Step 8.3 — Update CORS for production
**WHY:** Right now CORS allows everything (*). For production, lock it to your Vercel URL.
```
PROMPT: In backend/main.py, change allow_origins from ["*"] to ["https://your-app.vercel.app", "http://localhost:3000"]. Replace with your actual Vercel URL.
```

---

## PHASE 9: DEMO PREP

### Step 9.1 — Write the README for submission
**WHY:** Hackathon judges read the README first. It needs to explain what SPINE does, why it's different, and how to run it.
```
PROMPT: Create a README.md in spine-app root. Structure: 1) One-line pitch ("Every other company brain waits to be asked. This one asks you."), 2) Screenshot/GIF, 3) What makes it different (truth decay, reflex agents, Vera), 4) Architecture diagram (text), 5) How to run locally, 6) Tech stack, 7) The 5 planted faults explained, 8) AI disclosure (Claude Code used, disclosed per Rule 11).
```

### Step 9.2 — Record a demo video
**WHY:** Required for submission. Show: open the app → click "Run Reflexes" → findings appear in The Pulse → ask "Who owns the billing service?" → watch the graph walk → see the ownership hole → Vera asks about the stale claim → answer Vera → claim refreshes.
```
No Claude Code prompt for this — you record this yourself.
```

### Step 9.3 — Add AI disclosure
**WHY:** Rule 11 says AI coding assistants must be disclosed.
```
PROMPT: In README.md, add a section: "## AI Disclosure\nThis project was built with the assistance of Claude Code (Anthropic). All code was reviewed, understood, and can be explained by the developer. The architecture, graph model, and truth decay formula were designed collaboratively."
```

---

## ORDER TO DO THINGS

**Today (Day 1 — Oct 15):**
Phase 0 → 1 → 2 → 3 → 4 → 5 → 6
Get it running on your machine.

**Day 2 (Oct 16):**
Phase 7 (steps 7.1 through 7.7)
Make the UI demo-ready.

**Day 3 (Oct 17):**
Phase 8 (deploy) + Phase 9 (README, video)
Ship and submit.

**Day 4 (Oct 18):**
Buffer. Fix bugs. Submit by 11:59 PM IST.
