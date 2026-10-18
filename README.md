# SPINE: the company brain that asks you

> Every other company brain waits to be asked. **This one asks you.**

Built for **Graph Hacks 2026** (WeMakeDevs x FalkorDB) by **Akash Amalan, team Nexis 3.0**.
**Tracks entered:** 03 Company Brain (main) · 01 Agents That Act on Connected Data · 02 Agent Memory and Coordination

**Demo video:** [PASTE YOUTUBE LINK] · **Blog post:** [PASTE BLOG LINK]

![The SPINE desktop](https://drive.google.com/file/d/1bLKcw4M0uboyD8TNTztT6qnWkF1wMSYM/view?usp=sharing)
<!-- IMAGE 02: the whole desktop with windows, menu bar and dock. Arrows: "Menu bar", "Windows", "Dock" -->

---

## Contents
1. [The problem](#the-problem)
2. [What SPINE does](#what-spine-does)
3. [The one idea that makes it different: the trust rule](#the-trust-rule)
4. [A tour of the screen](#a-tour-of-the-screen)
5. [Why the graph is the product](#why-the-graph-is-the-product)
6. [Graph data model](#graph-data-model)
7. [Key Cypher queries](#key-cypher-queries)
8. [Truth decay](#truth-decay)
9. [Roles and Simulation](#roles-and-simulation)
10. [Tech stack](#tech-stack)
11. [Run it locally](#run-it-locally)
12. [Data, AI use and honest limits](#data-ai-use-and-honest-limits)
13. [Credits and team](#credits-and-team)

---

## The problem

Company knowledge rots.

- The person who owned the billing service left.
- The deploy guide is 14 months old.
- Two runbooks say opposite things.

Nobody notices until something breaks. And a normal AI chatbot makes it worse: it finds the old document and repeats the stale answer in a very sure voice.

## What SPINE does

SPINE is a company brain with three parts. You do not need to know anything about graphs to use it.

| Part | What it does, in plain words |
|---|---|
| **Answer Engine** | You ask "Who owns the billing service?". SPINE walks through the company graph one step at a time, shows the path it took, and gives the answer with its evidence and how sure it is. |
| **Reflex Layer** | Small "patrol agents" scan the graph on their own. They raise findings: *only one person knows this*, *nobody looks after this*, *this might be outdated*, *two documents disagree*, *the owner has left*. |
| **Vera** | An outreach agent. When a fact looks doubtful, Vera asks the right **person** to confirm it. |

## The trust rule

This is what makes SPINE different from a chatbot.

```
Layer 3  Meta       Findings, tasks, agent runs, responses   <- agents may write here
Layer 2  Semantic   Claims: "Priya owns billing" + confidence <- ONLY a human answer can change this
Layer 1  Source     People, teams, services, documents
```

- Patrol agents can **only write notes** (Layer 3). They can raise a flag. They can never change a fact.
- The **only** thing that can change what SPINE believes (Layer 2) is a person's answer, arriving through one endpoint: `POST /api/vera/respond`.
- The person's **exact words** are stored. The old claim is marked *superseded*. **Nothing is ever deleted.**

An AI cannot quietly rewrite the company's memory. It can only ask a human.

---

## The demo in one minute

1. Ask **"Who owns the billing service?"**. SPINE draws the path it walked. **Priya Sharma**, the listed owner, shows as a faded ghost with "Left in Jul 2026", because she has left the company. Nobody has taken over, so SPINE says so instead of guessing.
2. In **What SPINE noticed**, a finding says nobody looks after the billing service.
3. Open the **Simulation** window and make something happen (for example "Sam Okafor leaves the company"). SPINE notices on its own, with no refresh.
4. **Vera** asks a real person: *"Is this still true? Priya Sharma is the primary owner of the billing service."*
5. The person answers in their own words (for example: "No, Dana Kim owns billing now."). SPINE stores those exact words and marks the old fact **replaced**. Nothing is deleted.

Only a person's answer changed what SPINE believes.

## A tour of the screen

SPINE looks like a small desktop: draggable windows, a menu bar on top, and a dock at the bottom.

### Welcome screen
![Welcome screen](docs/screenshots/01-welcome.png)
<!-- IMAGE 01: welcome screen with the changing words. Arrow: "Press Enter to start" -->

The first thing you see. Press Enter to open the workspace.

### Why a dock?
A dock keeps every tool one click away, without using screen space when you do not need it. A new employee should not have to hunt for "where do I ask a question?" or "where do I see what is flagged?". The dock puts **Ask, the Graph, What SPINE noticed and Vera** in the same place every time. It is a pattern people already know from their own computer, so there is nothing new to learn.

![The dock](docs/screenshots/03-navigation-search.png)
<!-- IMAGE 03: close-up of the menu bar, ask bar and dock. Arrows: "Navigation", "Search" -->

- **Menu bar (top):** File, View, Window, Help, live numbers, "Scan now", who you are, and "Switch person". It stays fixed, so you are never far from asking a question.
- **Ask bar (middle bottom):** type a question in plain words. Press **Ctrl + K** from anywhere to jump to it.
- **Dock (bottom):** one icon per tool. A small dot means the window is open. A red number is something waiting for you.

### What SPINE noticed, and Vera
![Findings and Vera](docs/screenshots/04-noticed-vera.png)
<!-- IMAGE 04: findings on the left, Vera's questions on the right. Arrows: "What SPINE noticed", "Vera" -->

- **What SPINE noticed (left):** problems the patrol agents found on their own, before anyone asked. Five live numbers sit at the top: facts up to date, single points of failure, nobody looks after, average fact age, fixed this week.
- **Vera (right):** questions SPINE has for real people, when a fact looks doubtful.

### The graph: the path SPINE walked
![The graph path](docs/screenshots/05-graph-path.png)
<!-- IMAGE 05: graph drawing the path for "Who owns the billing service?". Arrow: "The path SPINE walked" -->

Ask "Who owns the billing service?" and the graph draws the path, hop by hop. Someone who has **left the company** shows as a faded ghost. Click **Show how I did this** to see the real Cypher query behind every step.

### Right-click for actions
![Right-click menu](docs/screenshots/06-right-click.png)
<!-- IMAGE 06: right-click menu on a person in the graph. Arrow: "Right-click for actions" -->

Right-click almost anything: a person, a service, a document, a finding, or the answer text.

### Every number can be explained
![Confidence math](docs/screenshots/07-confidence-math.png)
<!-- IMAGE 07: the confidence-math popover. Arrow: "Why is this flagged?" -->

Right-click a finding and choose **Why is this flagged?**. SPINE shows how it got its confidence number, step by step, using the real values.

### Simulation: make a change, watch SPINE notice
![Simulation](docs/screenshots/08-simulation.png)
<!-- IMAGE 08: the Simulation window with new findings appearing. Arrow: "Make a change, watch SPINE notice" -->

An admin can make a person leave, let time pass, add conflicting documents, or add an orphan service. SPINE notices live, with no page refresh.

### Facts and Activity
![Facts and Activity](docs/screenshots/09-facts-activity.png)
<!-- IMAGE 09: Facts (least trusted first) and Activity. Arrows: "Facts", "A person's words" -->

- **Facts:** every fact SPINE believes, least trusted first, with its confidence bar and age.
- **Activity:** a feed of what happened. When a person answers Vera, their **exact words** are shown next to the fact they replaced.

### Who are you?
![Who are you](docs/screenshots/10-who-are-you.png)
<!-- IMAGE 10: the "Who are you?" picker. Arrow: "Switch person" -->

Pick a person and a role (admin or viewer). You can switch at any time from the menu bar.

---

## Why the graph is the product

The hard questions in a company are about **connections**:

- Who owns this service?
- What breaks if the user service goes down?
- Who is the only person who knows this?

In FalkorDB these are short Cypher queries. If FalkorDB is taken out, SPINE stops working: every hop of every answer is a live query, and every patrol agent is a graph query too. The graph is not a picture drawn on top of other storage.

## Graph data model

One FalkorDB graph called `spine`, in three layers.

**Layer 1: Source (what exists)**

| Node | Meaning |
|---|---|
| `Person` | An employee. `left_at` is set if they left. |
| `Team` | A team of people. |
| `Service` | A system or service. |
| `Document` | A runbook, guide or policy. |

**Layer 2: Semantic (what SPINE believes)**

| Node | Meaning |
|---|---|
| `Claim` | One fact, for example "Priya Sharma owns billing-service". It has `base_conf`, `asserted_at`, `half_life_days` and a type. |

**Layer 3: Meta (what SPINE noticed and did)**

| Node | Meaning |
|---|---|
| `Finding` | Something a patrol agent noticed. |
| `VerifyTask` | A question for a person. |
| `AgentRun` | One pass of a patrol agent. |
| `Response` | A person's exact answer to Vera. |

**Relationships**

| Edge | Meaning |
|---|---|
| `OWNS` | A person owns a service. |
| `DEPENDS_ON` | A service depends on another. |
| `MEMBER_OF` | A person belongs to a team. |
| `MENTIONS` | A document mentions a service or person. |
| `SUPERSEDES` | A new claim replaces an old one. Only written after a human answer. |
| `CONTRADICTS` | Two documents or claims disagree. |

<!-- VERIFY this table against scripts/seed_data.py and backend/agents/reflex_agents.py. Add or remove rows to match the real schema. -->

## Key Cypher queries

These are the queries the product depends on. Each is shown by the **Show how I did this** drawer in the app.

<!-- VERIFY: replace these examples with the real queries from backend/tools/answer_tools.py and backend/agents/reflex_agents.py. Keep one sentence under each. -->

**1. Who owns a service (Answer Engine, first hop)**
```cypher
MATCH (p:Person)-[o:OWNS]->(s:Service {name: $service})
RETURN p.name, p.left_at, o.since
```
Finds the people linked to a service. A person with `left_at` set is shown as a ghost.

**2. What breaks if a service goes down (blast radius)**
```cypher
MATCH (s:Service {name: $service})<-[:DEPENDS_ON*1..3]-(affected:Service)
RETURN DISTINCT affected.name
```
Follows `DEPENDS_ON` edges outward to find everything that would be affected.

**3. Single point of failure (Reflex agent)**
```cypher
MATCH (s:Service)<-[:OWNS]-(p:Person)
WITH s, count(p) AS owners
WHERE owners = 1
RETURN s.name
```
Finds services that only one person looks after.

**4. Nobody looks after this (Reflex agent)**
```cypher
MATCH (s:Service)
WHERE NOT (s)<-[:OWNS]-(:Person)
RETURN s.name
```
Finds services with no owner at all.

**5. Two documents disagree (Reflex agent)**
```cypher
MATCH (a:Document)-[:CONTRADICTS]->(b:Document)
RETURN a.title, b.title
```
Lists pairs of documents that say different things.

## Truth decay

Facts get less trustworthy as they age:

```
confidence = base x 0.5^(age / half_life) x min(1.5, 1 + 0.15 x ln(sources))
```

| Kind of fact | Halves every |
|---|---|
| Ownership | 120 days |
| Org (who reports to whom) | 180 days |
| Process | 270 days |
| Policy | 365 days |
| Architecture | 540 days |

Fresh facts are green, older ones turn amber, and very old ones turn red and trigger a finding. The math lives in `backend/utils/confidence.py`.

## Roles and Simulation

- **Admin:** can use Simulation, run a scan, and see Activity.
- **Viewer:** can ask, see the graph and findings, see Facts and the Directory, and answer their own Vera questions.

Sign-in is demo-only (see limits below), but the server **really enforces** the difference: a viewer calling an admin route gets a `403` error.

## Tech stack

| Part | Choice |
|---|---|
| Graph database | **FalkorDB Cloud** (Docker also works) |
| Backend | Python, FastAPI, Server-Sent Events |
| AI wording and routing | Groq (gpt-oss models) |
| Frontend | Next.js, React, Tailwind, React Flow, motion |
| Look and feel | React Bits (animated background and dock, adapted) |

## Run it locally

You need Python 3.10+, Node.js 18+, and a FalkorDB instance (FalkorDB Cloud free tier, or Docker).

```bash
# 1. get the code
git clone [PASTE YOUR REPO URL]
cd spine-app

# 2. add your own keys (never commit this file)
cp .env.example .env
# open .env and fill in the FalkorDB and Groq values

# 3. backend
pip install -r requirements.txt
python scripts/seed_data.py             # builds the invented company
uvicorn backend.main:app --port 8004

# 4. frontend (new terminal)
cd frontend
npm install
npm run dev                             # http://localhost:3000
```

<!-- VERIFY: command names and port against the repo. frontend/.env.local must contain NEXT_PUBLIC_API_URL=http://localhost:8004 -->

Using Docker for the database instead of the cloud:
```bash
docker run -p 6379:6379 -p 3000:3000 falkordb/falkordb:latest
```
(If you use Docker, the web app also wants port 3000, so run the frontend on another port, for example `npm run dev -- -p 3001`.)

**Health check:** open `http://localhost:8004/health`. It should say OK.

**Live deployment:** [PASTE LINK, or delete this line] If there is no live link, the local setup above is the full instructions.

## Data, AI use and honest limits

**Data.** Every person, team, service and document in this demo is **invented**. No real company or personal data is used.

**AI disclosure.** This project was built with the help of AI coding assistants (Claude Code and Claude). The AI helped write code, but the idea, the trust rule, the design choices and the testing are ours. Akash Amalan reviewed and tested the project and can explain the graph model, the queries and the architecture.

**Limits (honest).**
- Demo sign-in only: a person is picked from a list, there are no passwords. The server still enforces admin-only routes.
- Embeddings are lightweight hash-based vectors, not a large embedding model.
- One invented company. Not tested at real company size.
- Vera asks inside the app. Slack or Teams is future work.

**What's next.** Real integrations (Slack, GitHub, docs), real sign-in, scale tests, and Vera asking people in the tools they already use.

## Credits and team

- [FalkorDB](https://www.falkordb.com/) and [WeMakeDevs](https://www.wemakedevs.org/) for the hackathon
- [React Bits](https://reactbits.dev/) for the animated background and dock (adapted) [CHECK THEIR LICENSE]
- [Groq](https://groq.com/) for fast language models
- [React Flow](https://reactflow.dev/) for the graph

**Team Nexis 3.0** · Akash Amalan (solo)

## License

[MIT, or the license the hackathon requires]
