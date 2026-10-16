# SPINE Redesign: Master Build Document for Claude Code

> **Akash, read this box first. Claude Code reads everything below it.**
>
> 🧩 **What this is:** one document that tells Claude Code how to turn SPINE into a calm, Apple-style, fun app that a brand-new employee understands at first sight. Every phase is one prompt.
>
> 📦 **Setup (2 minutes, once):**
> 1. Unzip `spine-ui-kit.zip`.
> 2. Copy the `watermelon/` and `reactbits/` folders into `spine-app/frontend/app/components/ui/_source/`.
> 3. Copy this file (`SPINE_REDESIGN.md`) into the `spine-app/` root folder.
>
> ▶️ **How to run it:** in Claude Code, paste **one line per phase**:
> ```
> Read SPINE_REDESIGN.md. Do Phase 0 only. Follow the Global Rules. When finished, give me the Phase Report.
> ```
> Then change `Phase 0` to `Phase 1`, and so on. **Never paste two phases at once.** Test in the browser between phases.
>
> ⏰ **Timeline:** Phases 0–5 are **must-do** (that's the demo). Phases 6–8 are **only if you're ahead**. Deploy no later than the night of Oct 17.

---

## Part A: The Product (Claude Code: read this before every phase)

### A1. What SPINE is

SPINE is a **company brain** for Northwind Engineering, a fictional, fully synthetic company. Knowledge lives in a FalkorDB graph: people, teams, systems, documents, and **claims** (facts), and every claim has a confidence that **decays over time**.

Three parts, and these are the names users see:

| Internal name | User-facing name | What the user sees |
|---|---|---|
| Answer Engine (`/api/ask`) | **Ask** | Ask a question, get a plain answer + how sure SPINE is + who to talk to |
| Reflex Layer (`/api/reflexes/run`, findings) | **Health** | Problems SPINE found by itself (nobody owns X, only one person knows Y, info is outdated, docs disagree) |
| Vera (`/api/vera/*`) | **Vera** | A friendly fact-checker who asks humans when something looks wrong, and only writes down what a human says |

### A2. Who the user is

A **new employee in their first week**. They don't know what a "claim", "finding", "hop", "bus factor" or "Cypher" is. Every screen has to answer, in plain words:

- **Where am I?** (tab name + one-line subtitle)
- **What can I do here?** (one obvious main action)
- **What does this mean?** (labels in everyday words, never jargon)

Engineers and hackathon judges can still see the technical depth, but only one level deeper, inside "How I found this".

### A3. Feel

Calm, light, friendly, playful in small touches. Think Apple Notes + Apple Weather, not a hacker dashboard. Light mode is the default. Big readable answers. Lots of white space. Motion is soft springs, never jittery.

### A4. Plain-language dictionary (always use the right column)

| Never show | Show instead |
|---|---|
| bus_factor | "Only one person knows this" |
| orphan | "Nobody looks after this" |
| decay / stale | "This might be outdated" |
| contradiction | "Two documents disagree" |
| missing_owner / owner_expired | "The owner has left" |
| confidence ≥ 80% | 🟢 "Up to date" |
| confidence 60–79% | 🟠 "Getting old" |
| confidence < 60% | 🔴 "Probably outdated" |
| severity critical/high | "Urgent" |
| severity medium | "Soon" |
| severity low | "When you can" |
| VerifyTask / probe | "Vera's question" |
| Finding | "Problem" |
| Run Reflexes | "Run health check" |
| hop / walk | "step" / "how I found this" |
| asserted_at 311 days | "written 10 months ago" |
| `claim-billing-owner`, `vtask-6f8f…` (any id) | **never shown**, always the human name |

---

## Part B: Global Rules (apply to every phase)

1. **Don't break the brain.** Keep every existing API endpoint, SSE stream and data flow working. Change presentation, and only add backend endpoints where a phase says so.
2. **Trust rule (core of the project):** reflex agents write only Layer 3 (Findings, VerifyTasks, AgentRuns). **Only Vera's response path may change Layer 2** (claims, ownership), and only by carrying a human's words, stored raw on a `Response` node. Never delete or edit an old claim. Supersede it.
3. **No ids on screen, ever.** Map every id to a name (see A4).
4. **Real data only.** UI shows live API data. No mock arrays left from the component demos, no pravatar/unsplash images. People avatars are **initials in a colored circle** (color = stable hash of the name).
5. **Components:** the raw sources are in `frontend/app/components/ui/_source/`. For each one you use, create an adapted copy in `frontend/app/components/ui/`, then:
   - switch any `framer-motion` import to `motion/react`
   - replace hardcoded colors (`#F4F4F4`, `bg-neutral-100`, `text-[#262626]`, …) with our tokens (`bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`…)
   - remove demo defaults (fake users, trades, ETH, images)
   - React Bits files (`_source/reactbits/*.jsx` + `.css`): keep them as `.jsx` with their CSS file next to them (enable `allowJs` in tsconfig if needed) and add a small typed `.tsx` wrapper if you need props typing. Don't rewrite their WebGL/canvas internals.
   - Leave `_source/` untouched so it stays the reference.
6. **WebGL/canvas components** (`GradientASCII`, `CrystalizedBall`, `TechText`) must be loaded with `next/dynamic` and `{ ssr: false }`, because they touch `window`/`document` during render. **Only one WebGL canvas may be visible at a time.** Unmount it when its tab isn't active.
7. **Motion (Apple style):** default spring `{ type: 'spring', bounce: 0, duration: 0.4 }`. Use bounce 0.15–0.2 only for things the user flicked or for a success check. Buttons react on press (`active:scale-[0.97]`). Everything animates from its current position (springs, not keyframes, for anything interactive). Honor `prefers-reduced-motion` (swap to 150ms fades) and `prefers-reduced-transparency` (solid instead of blur).
8. **Accessibility:** every icon button has an `aria-label`; text contrast ≥ 4.5:1 in both themes; everything works with the keyboard; focus rings are visible.
9. **After every phase:** run `npm run build` in `frontend` and fix all errors; make sure the Next.js dev error badge shows **0 issues**; click through the changed screens.
10. **Phase Report (end of every phase), in plain words:** ① what changed (a bullet per screen) ② files touched ③ anything you could not do and why ④ exactly what I should click to test it.

---

## Part C: Design System

### C1. Tokens (`frontend/app/globals.css`)

shadcn-compatible names, so the components work without edits:

| Token | Light | Dark |
|---|---|---|
| `--background` | `#F5F5F7` | `#000000` |
| `--foreground` | `#1D1D1F` | `#F5F5F7` |
| `--card` / `--card-foreground` | `#FFFFFF` / `#1D1D1F` | `#1C1C1E` / `#F5F5F7` |
| `--muted` / `--muted-foreground` | `#EDEDF0` / `#6E6E73` | `#2C2C2E` / `#98989D` |
| `--secondary` / `--secondary-foreground` | `#E8E8ED` / `#1D1D1F` | `#3A3A3C` / `#F5F5F7` |
| `--accent` / `--accent-foreground` | `#E8F0FE` / `#0071E3` | `#0A2A4D` / `#0A84FF` |
| `--primary` / `--primary-foreground` | `#0071E3` / `#FFFFFF` | `#0A84FF` / `#FFFFFF` |
| `--destructive` | `#FF3B30` | `#FF453A` |
| `--border` / `--input` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.10)` |
| `--ring` | `#0071E3` | `#0A84FF` |
| `--fresh` (Up to date) | `#34C759` | `#30D158` |
| `--aging` (Getting old) | `#FF9F0A` | `#FFD60A` |
| `--stale` (Probably outdated) | `#FF3B30` | `#FF453A` |
| `--vera` (Vera's color) | `#AF52DE` | `#BF5AF2` |
| `--chart-2` (positive) | `#34C759` | `#30D158` |

- Expose them to Tailwind v4 with `@theme inline` (`--color-card: var(--card)` …).
- Dark mode uses the `.dark` class (next-themes). Add **`@custom-variant dark (&:where(.dark, .dark *));`** so the components' `dark:` classes work.
- Keep the old token names (`--paper`, `--ink`, `--signal`…) as aliases until every old component is gone.

### C2. Type, shape, depth

- Font: keep Geist (local). Body 15px/1.5. Large titles: tight leading 1.1, letter-spacing −0.02em. Small labels: 12px, +0.01em.
- Radius: chips 12px · cards 20px · big panels/sheets 28px · pills full.
- Shadow (cards): `0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)`.
- Materials: top bar and floating panels use `bg-background/70 backdrop-blur-xl saturate-150`. Never stack translucent on translucent.

### C3. Spacing and layout

- Content column max-width 880px, centered, 32px top padding, 16px side gutter on phones.
- One primary action per screen.

---

## Part D: Component Map

All sources are in `frontend/app/components/ui/_source/`.

| Source file | New name in SPINE | Where | Becomes |
|---|---|---|---|
| `watermelon/FluidTabs.tsx` | `TabBar` | Top bar | Ask · Health · Vera tabs with sliding pill + badges |
| `watermelon/SwitchMode.tsx` | `ThemeSwitch` | Top bar | Light/dark switch (small: 64×32) |
| `reactbits/PromptBar.jsx` | `AskBar` | Ask | The question box with `@` mentions (systems, people) and `/` shortcuts |
| `reactbits/ThoughtLine.jsx` | `ThinkingLine` | Ask | "Thinking…" line that lists real steps live, then folds into "Thought for 2.4s" |
| `reactbits/GradientASCII.jsx` | `HeroBackdrop` | Ask (empty state only) | Soft animated background behind the greeting |
| `watermelon/CardAccordion.tsx` | `AnswerDetails` | Ask | "Facts I used / How I found this" |
| `watermelon/ViewOnMap.tsx` | `MapPill` | Ask | "Show me the map" pill that grows into the knowledge graph |
| `watermelon/QuickFeedback.tsx` | `WasThisHelpful` | Ask | 👍 / 👎 under each answer (👎 asks Vera to double-check) |
| `watermelon/InlineOverflow.tsx` | `AnswerActions` | Ask | Copy · Ask follow-up · (…) Show map · Copy for Slack |
| `watermelon/VoiceChatDisclosure.tsx` | `MeetTheTeam` | Ask (empty state) | Avatar stack "8 people at Northwind" that opens into a team grid |
| `watermelon/RunActionButton.tsx` | `HealthCheckButton` | Health | "Run health check" morphing button with real steps |
| `watermelon/MinimalCarousel.tsx` | `ProblemTiles` | Health | 4 colorful category tiles that expand |
| `watermelon/TradeSummary.tsx` | `ProblemList` | Health | List of problems with a confidence sparkline |
| `watermelon/TaskWidget.tsx` | `FixItCard` | Health | Turns a problem into a small to-do plan |
| `reactbits/BellToggle.jsx` | `WatchToggle` | Health, Person card | "Watch this system / person" |
| `reactbits/LatticeLoader.jsx` | `Loader` | Everywhere | The one small loading indicator |
| `watermelon/WaveformScrub.tsx` | `TimeMachine` | Health | Drag into the future and watch facts go out of date |
| `reactbits/CrystalizedBall.jsx` | `VeraOrb` | Vera | Vera's living orb: calm when all good, energetic when she has questions |
| `watermelon/InviteDisclosure.tsx` | `VeraInbox` | Vera (+ Ask corner) | "Vera has 3 questions for you" |
| `watermelon/DialogStack.tsx` | `VeraQuestion` | Vera | Question card + "What happens next?" card |
| `watermelon/SaveToggle.tsx` | `SendButton` | Vera | Send → spinner → ✓ Saved |
| `watermelon/TimedUndoAction.tsx` | `UndoToast` | Vera, Teach | 5-second undo before anything is saved |
| `watermelon/EditProfile.tsx` | `PersonCard` (read-only) | Everywhere a name appears | Who they are, what they look after, what they know |
| `watermelon/OnboardingChecklist.tsx` | `FirstWeek` | Floating, bottom-left | "Your first week at Northwind" 5 tasks |
| `watermelon/FloatingInput.tsx` | `TextField` | Welcome sheet, forms | Floating-label input |
| `watermelon/FloatingDisclosure.tsx` | `TeachSpine` | Floating, bottom-right | "+" → tell SPINE something changed |
| `reactbits/TechText.jsx` | `Wordmark` *(optional)* | Welcome sheet | Interactive "SPINE" letters |
| `watermelon/VoiceNote.tsx` | `VoiceAnswer` *(optional)* | Vera | Answer Vera by voice |
| `watermelon/TranscribeVoiceMessage.tsx` | *(optional)* | Vera history | Play a voice answer with its transcript |
| `watermelon/IntegrationsCard.tsx` | *(later)* | — | "Where SPINE learned this" list of source docs |

**Not used, on purpose:** RadialCarousel (photo gallery), Stepper, OnboardingScreen (a setup form wastes demo time), RevealAndCopy, PulseHeart (overlaps 👍), DitherVeil, ScrollIsland, ScheduleDate, DrawSignature, CreateNewDisclosure (FloatingDisclosure replaces it).

---

## Part E: The Screens (target picture)

```
┌───────────────────────────────────────────────────────────┐
│ SPINE · Northwind     ( Ask │ Health ③ │ Vera ② )      ☀︎◐ │ ← frosted bar
├───────────────────────────────────────────────────────────┤
│  ░░▒▒▓ animated ASCII glow (only before first question) ▓▒░ │
│        Good evening 👋                                     │
│        Ask anything about Northwind. I'll tell you what I   │
│        know, and how sure I am.                             │
│   ┌───────────────────────────────────────────────────┐    │
│   │ Who owns @billing-service?                    ⬆   │    │ ← AskBar
│   └───────────────────────────────────────────────────┘    │
│   (Who owns billing?) (What breaks if…) (How do we deploy?)│
│   (SO)(ML)(RP)(JR) +4  Meet the team ▾                     │
│                                                            │
│   ✦ Checking who owns it… 1.2s ▾                           │ ← ThinkingLine
│   ┌ Answer ───────────────────────────────────────────┐    │
│   │ Nobody owns billing-service right now. Priya       │    │
│   │ Sharma did, but she has left.                      │    │
│   │ 🔴 Probably outdated · confirmed 10 months ago     │    │
│   │ Talk to: (SO) Sam Okafor  (ML) Mei Lin             │    │
│   │ ⚠️ Heads up…            [Ask Vera to find out]      │    │
│   │ 👍 👎          ( Copy )( Ask follow-up )( … )       │    │
│   └────────────────────────────────────────────────────┘    │
│   ▸ Facts I used   ▸ How I found this    [🗺 Show me the map]│
│ ┌ Your first week ▮▮▯▯▯ 2/5 ┐                         ( + ) │
└───────────────────────────────────────────────────────────┘
```

---

# Part F: The Phases

Each phase is self-contained. Do exactly what it says, then give the Phase Report.

---

## Phase 0: Fix bugs + lay the foundation (no visual redesign yet)

**Bugs**
1. **Vera duplicate key crash** ("Encountered two children with the same key `vtask-…`"). `GET /api/vera/probes` returns one row per FLAGS target, so a decay finding that flags both a claim and its system returns the same VerifyTask twice. Fix the Cypher to return **one row per VerifyTask** (collect targets into a list), and also dedupe by `task_id` in the frontend before setting state.
2. **Dev error badge.** Open every issue in the Next.js dev indicator, list them for me in plain words, and fix all of them until it shows 0.
3. **Answer quality check.** Call `/api/ask` with these four and paste the final `answer` text for each in the Phase Report: `hi` · `who owns the billing service?` · `what breaks if the user service goes down?` · `how do we deploy?`. If any answer is vague, ignores the question, or invents facts, fix the backend prompt/tool routing first. A beautiful UI on a bad answer still loses the demo.

**Foundation**
4. Install in `frontend`: `motion lucide-react react-icons react-use-measure @hugeicons/react @hugeicons/core-free-icons clsx tailwind-merge next-themes ogl`.
5. Create `frontend/lib/utils.ts` exporting `cn(...inputs)` (clsx + tailwind-merge). Make the `@/*` path alias in `tsconfig.json` resolve from the `frontend` root so `@/lib/utils` works. Enable `allowJs` for the React Bits `.jsx` files.
6. Rebuild `globals.css` with the Part C tokens, `@theme inline`, and `@custom-variant dark (&:where(.dark, .dark *));`. Keep old token names as aliases.
7. Wrap the app in `next-themes` `ThemeProvider` (`attribute="class"`, `defaultTheme="light"`, `enableSystem`). Add `suppressHydrationWarning` on `<html>`.
8. Create `frontend/app/lib/labels.ts`, the single source of all user-facing wording from Part A4: `kindLabel(kind)`, `confidenceLabel(pct) → {text, token, emoji}`, `severityLabel(sev)`, `ageText(days)` ("written 10 months ago"), `initials(name)`, `avatarColor(name)`.
9. Create `frontend/app/lib/confidence.ts` mirroring `backend/utils/confidence.py` **exactly** (same formula, half-life defaults, 0.6 floor). Add a tiny self-check that compares 3 values against the backend's `scripts/test_confidence.py` expectations.
10. Add to `README.md` a **Credits** section: UI components adapted from Watermelon UI (ui.watermelon.sh) and React Bits (reactbits.dev). Check each project's license and write what it allows in the Phase Report.

**Done when:** build passes, 0 dev issues, Vera opens without the duplicate-key error, and the 4 answers are in the report.

---

## Phase 1: App shell (tabs, frosted bar, theme)

Replace the three-pane "control room" layout in `page.tsx` with an app shell. **Keep all existing state, SSE and API logic.** Only layout and presentation change.

1. Split `page.tsx` into `AskView`, `HealthView`, `VeraView` components (in `frontend/app/views/`). Shared state (findings, probes, stats, asking state) lives in one place and is passed down, or in a small React context. No new state library.
2. **Top bar:** sticky, `bg-background/70 backdrop-blur-xl`, hairline bottom border that only appears after scrolling (scroll-edge effect). Left: "SPINE" wordmark + small muted "Northwind". Center: `TabBar` (adapt `_source/watermelon/FluidTabs.tsx`) with tabs **Ask** (icon: sparkle/search), **Health** (icon: heart-pulse), **Vera** (icon: Vera "V" in a circle). Badges: Health = open problems, Vera = open questions (deduped). Right: `ThemeSwitch` (adapt `SwitchMode.tsx`, size 64×32).
3. Tab switch: content cross-fades and slides 8px **in the direction of travel** (Ask→Health slides from right; Health→Ask from left). Remember the last tab in the URL hash (`#ask`, `#health`, `#vera`) so refresh keeps your place.
4. Each view: max-width 880px, centered. Under each view's title, one plain subtitle:
   - Ask: "Ask anything about Northwind's systems, people and processes."
   - Health: "Problems SPINE found on its own, before anyone asked."
   - Vera: "Vera checks facts with real people. She never guesses."
5. Remove the old bottom stats bar and the old always-visible empty graph area.
6. Create `frontend/app/components/ui/Loader.tsx` by adapting `reactbits/LatticeLoader.jsx` (3×3, round, `color="currentColor"`, `doneColor="var(--fresh)"`). Use it for **every** loading state from now on, and replace any other spinner.

**Done when:** three tabs switch smoothly in both themes, badges show real counts, nothing from the old layout is broken.

---

## Phase 2: Ask (the heart of the demo)

### 2.1 Empty state (before the first question)
1. **HeroBackdrop:** adapt `reactbits/GradientASCII.jsx`, loaded with `next/dynamic` + `ssr:false`. Place it absolutely behind the greeting (height ~460px), with a CSS mask that fades its bottom edge to transparent. Settings: `shape="horizon"`, `characters=" ·:-=+*#"`, `cellSize={16}`, `density={0.55}`, `glyphOpacity={0.45}`, `gradientOpacity={0.5}`, `speed={0.4}`, `glow={0.15}`, `clickEffect="wave"`, `intro`. Light theme: `lightMode` with colors `['#0071E3','#F5F5F7','#A5D8FF','#5AC8FA']`. Dark theme: `['#0A84FF','#0B1220','#64D2FF','#5E5CE6']`. It must not reduce text contrast; the greeting sits on a soft `bg-background/60` blur pill if needed. When the first answer appears, fade it out (400ms) and **unmount** it. With reduced motion: `speed={0}`, no intro.
2. **Greeting:** time-of-day greeting ("Good morning/afternoon/evening 👋", plus the user's first name if set in Phase 7), large title style, then the Ask subtitle.
3. **MeetTheTeam:** adapt `VoiceChatDisclosure.tsx`. Data: people from the graph (add `GET /api/people` → `{id, name, role, team, active, owns_count}`). Collapsed: 4 initial-avatars + "+N" + "Meet the team". Expanded title: "The Northwind team". The little animated sound-bars badge means **"looks after something right now"** (owns_count > 0); add a legend line under the grid. CTA: "Ask who works on what" → asks "Who works on what?". Clicking a person opens `PersonCard` (Phase 6). If Phase 6 isn't done yet, ask "What does {name} work on?".

### 2.2 The question box: `AskBar`
Adapt `reactbits/PromptBar.jsx` into `AskBar`:
- `placeholder`: "Ask anything… try @billing-service or /who-owns"
- `sources` (the `@` menu): every system, person and team from a new `GET /api/entities` → `{id, name, type}`, with icons per type (system = server icon, person = user icon, team = users icon) and the type as description ("System", "Person · Platform team"). **Remove** the "Photos & files" row and `onAttach`.
- `commands` (the `/` menu): `/who-owns` "Who looks after something", `/what-breaks` "What depends on a system", `/how-do-i` "Steps for a process", `/who-knows` "Who to ask about a topic", `/explain` "Explain it like I'm new here".
- `models={[]}` and `efforts={[]}` (hidden: we don't burden new users with model choice).
- `busy` = asking. `onStop` aborts the stream (use an `AbortController` on the fetch).
- Colors: pass CSS variables, e.g. `background="var(--card)" color="var(--foreground)" menuBackground="var(--card)"`. Give it a 1px `border-border` and the card shadow. `width` = full column, `radius={20}`.
- `onSend(text)`: send to `/api/ask` as `{question, mentions:[{id,type}], command}`. Parse `@Name` tokens and the leading `/command` client-side.
- **Backend:** in `/api/ask`, if `mentions` are present, use them directly as resolved entities (skip LLM entity extraction). If `command` is present, use it as the intent (who-owns→ownership, what-breaks→impact, how-do-i→process, who-knows→ownership/authors, explain→general with a "very simple words" style hint).
- Keep the example chips under the bar. Clicking one sends immediately.
- ⌘K / Ctrl+K focuses the bar from anywhere.

### 2.3 Thinking: `ThinkingLine`
Adapt `reactbits/ThoughtLine.jsx`. `working` = asking. `steps` = friendly labels **appended live from the real SSE hop events**: understanding → "Reading your question", find_entry_points → "Searching what Northwind knows", who_knows/broken_path → "Checking who owns it", blast_radius → "Seeing what depends on it", check_findings → "Looking for known problems", neighbours → "Gathering context", final → "Writing your answer". `label` = the latest step + "…". When the final event arrives it settles into "Thought for 2.4s" and folds. Clicking re-opens the steps. No fake timers.

### 2.4 The answer card
White card (`bg-card`, 20px radius, shadow), springs up from below (bounce 0, 0.4s). Inside, top to bottom:
1. **The answer** in 19px text.
2. **How sure:** one pill from `labels.ts`, using the **lowest** confidence among the evidence used, plus age: "🔴 Probably outdated · written 10 months ago".
3. **Talk to:** person chips (initials avatar + name + role). Hidden if no people.
4. **Heads-up callout** (soft amber, only if there's an ownership gap or an open problem): e.g. "⚠️ Heads up: nobody currently owns billing-service. Priya Sharma did, but she has left." Button "Ask Vera to find out" → Vera tab with that question opened.
5. **Bottom row:** left `WasThisHelpful`, right `AnswerActions`.
   - `WasThisHelpful`: adapt `QuickFeedback.tsx`. 👍 → "Glad it helped!" 👎 → "Thanks. Vera will double-check." Each has Undo. Only after the undo window (5s) passes does 👎 call a new `POST /api/feedback {question, answer, evidence_claim_ids}`. The backend creates (MERGE) a `Finding{kind:'user_doubt'}` flagging those claims plus a Vera `VerifyTask` ("Someone thought this answer was wrong: is '<claim>' still true?"). Layer 3 only.
   - `AnswerActions`: adapt `InlineOverflow.tsx`. Visible: **Copy**, **Ask follow-up** (pre-fills the bar with "About that, "). Hidden behind "…": **Show me the map**, **Copy for Slack** (answer + "via SPINE" + confidence line).
6. Greeting/off-topic answers: a small friendly card with the example chips again. No pills, no details.

### 2.5 Under the answer
- **AnswerDetails:** adapt `CardAccordion.tsx` with two items:
  - "Facts I used" (icon: list): each evidence item = the fact in plain text, a thin confidence bar colored by label, the label, and its age. Clicking a fact's subject opens that system/person.
  - "How I found this" (icon: route): numbered steps in plain words with their icon. Each step has a small "Show query" link that reveals its Cypher in a monospace block (this is for engineers and judges).
- **MapPill:** adapt `ViewOnMap.tsx`. Replace the Google iframe with our Cytoscape graph of the nodes and edges touched by this answer. Collapsed pill: map icon + "Show me the map". Expanded with the shared `layoutId` morph: width = full column, height 420px, 28px radius, close button. Graph style: people = blue circles, systems = gray rounded squares, facts = small dots colored by confidence label, anything with an open problem = red ring. Labels are names, wrapped and truncated, with full text on hover. Layout `cose`, `randomize:true`, `fit` with padding. Mount Cytoscape only when expanded. Light/dark aware.

**Done when:** I can type `@` and `/`, watch the thinking line list real steps, read a plain answer with a colored "how sure" pill, give 👍/👎 with undo, open facts/steps/query, and expand the map. All 4 test questions produce sensible cards.

---

## Phase 3: Health

1. **HealthCheckButton:** adapt `RunActionButton.tsx`. Idle: ⚡ "Run health check". Running steps (advance on a ~0.9s timer, but **only** show done when the API answers): "Checking owners" → "Finding forgotten systems" → "Checking for outdated info" → "Comparing documents". Done: ✓ "Found N problems" (N from the response). Calls `POST /api/reflexes/run`; afterwards refresh problems, Vera questions and stats.
2. **ProblemTiles:** adapt `MinimalCarousel.tsx`. Four tiles in a 2×2 grid:
   - 🔴 "Nobody looks after this" (orphan + missing_owner), color `--stale`
   - 🟠 "Only one person knows this" (bus_factor), orange
   - 🟡 "Might be outdated" (decay + user_doubt), `--aging`
   - 🟣 "Documents disagree" (contradiction), purple
   Each shows icon, title and big count. Clicking expands it (layoutId spring). The others shrink into a row of three. The expanded tile adds one plain "why it matters" sentence (e.g. "If Ravi is out sick, nobody else knows how web-frontend works."). Replace "Copy address/Edit" with **See list** and **Ask Vera**. Click the background to collapse.
3. **ProblemList:** adapt `TradeSummary.tsx`. Filtered by the selected tile (or all). Each row: subject name (bold), the plain problem sentence, severity pill (Urgent/Soon/When you can), "found 16 min ago", and for fact-related problems a **sparkline of that fact's confidence over the last 12 months**, computed with `lib/confidence.ts` (the falling line shows decay at a glance; color = current label). Row menu "…": **Make a fix-it plan**, **Ask Vera**, **Ask SPINE about this**, **Show on map**. Remove all trading parts (P&L, contracts, LONG/SHORT, date pager, Add Trade, download). If the findings API lacks `base_conf / half_life_days / asserted_at / source_count` for fact problems, add them in the backend.
4. **FixItCard:** adapt `TaskWidget.tsx`. Opens (sheet, grows from its row) when choosing "Make a fix-it plan". Title from the problem, e.g. "Find a new owner for billing-service". Subtasks by kind:
   - bus_factor: "Pick a backup person" · "Share the runbook with them" · "Pair on one real task" · "Confirm the new owner with Vera"
   - orphan / missing_owner: "Check if anything still uses it" · "Decide: keep it or retire it" · "Give it an owner (via Vera)"
   - decay / user_doubt: "Ask the person who wrote it" · "Confirm or correct it with Vera"
   - contradiction: "Read both documents" · "Ask the owner which one is right" · "Fix the wrong one via Vera"
   The "…with Vera" subtask auto-checks when the related Vera question is answered. Other checkboxes are personal and saved in localStorage (try/catch). **Ticking a box never changes the graph.** Priority = severity label; status = Open / In progress / Fixed; people = who knows about it (initial avatars).
5. **WatchToggle:** adapt `reactbits/BellToggle.jsx` (`offLabel="Watch"`, `onLabel="Watching"`, colors via CSS variables). On the FixItCard and on rows. Watch list is stored in localStorage. When a new problem arrives (SSE) on a watched system, ring the bell (badge count) and show a small toast "New problem on billing-service".
6. Footer sentence from `/api/graph/stats` in words: "SPINE knows about 8 people, 8 systems and 16 facts."
7. New problems arriving via SSE slide in at the top of the list with a soft highlight that fades in 2s.

**Done when:** I can run a health check and see it count up, open a tile, read the list with sparklines, make a fix-it plan, and watch a system.

---

## Phase 4: Vera

1. **VeraOrb:** adapt `reactbits/CrystalizedBall.jsx` (`next/dynamic`, `ssr:false`). Size: 220px box, `size={0.85}`, `particleCount={5000}`, `theme` from next-themes. State → preset:
   - no open questions → `preset="frost"`, `speed={0.6}` (calm)
   - has questions → `preset="aurora"`, `color="var(--vera)"` resolved to hex (energetic)
   - just answered → briefly trigger a surge (simulate a click in the middle) then settle
   If WebGL2 isn't available, show a CSS radial-gradient circle in `--vera` that gently "breathes" (opacity 0.9↔1, 3s).
   Under the orb: "I'm Vera. When SPINE isn't sure about something, I ask the person who'd know. I never guess. I only write down what you tell me."
2. **VeraInbox:** adapt `InviteDisclosure.tsx`. Pill: "Vera has 3 questions for you" (badge = deduped open questions). Expanded list rows: icon by problem type, the question in plain words ("Does Jordan Rivera still look after the user service?"), the subject as subtitle, a dot if it's new since your last visit (localStorage). Never ids. Also show this pill (compact) top-right on the Ask tab when there are questions.
3. **VeraQuestion:** adapt `DialogStack.tsx`. Opens from the clicked row (scrim, card grows from that row).
   - Card 1 "Vera's question": the original fact in a quote block with source + age ("from Deploy Runbook v2 · written 10 months ago"). Three big buttons: "✅ Yes, still true" · "✏️ Something changed" · "🤷 I don't know". "Something changed" reveals a textarea ("e.g. Jordan moved teams. Mei Lin looks after it now."). The submit button is `SendButton` (adapt `SaveToggle.tsx`): "Send to Vera" → spinner → ✓ "Saved".
   - Link "What happens next?" pushes Card 2 (steps variant): 1) "Vera reads your answer" 2) "She updates SPINE. The old fact stays in history, never deleted" 3) "Everyone who asks next gets the fresh answer". Button "Got it".
4. **UndoToast:** adapt `TimedUndoAction.tsx`. After submit, **don't** call `POST /api/vera/respond` yet. Show a bottom-center toast "Undo" with a 5-second countdown. If not undone, send. Then show a success toast listing the response's `changes` in plain words ("user-service owner: Jordan Rivera → Mei Lin").
5. After success: the question leaves the list (exit animation), the orb surges then settles, and probes, problems and stats refresh. Empty inbox: "All caught up. SPINE's knowledge is fresh. ✨"
6. **Vera history** (below the inbox, collapsed by default): "What people told Vera" lists the last 10 `Response` nodes (new `GET /api/vera/history`): who answered (if known, else "A teammate"), when, the raw answer text, and the resulting change. This shows the trust rule to judges.
7. Delete the old `VeraOverlay` modal and the old tab strip with raw ids.

**Done when:** I can open a question, answer "Something changed" with a sentence, undo once, answer again, see the change summary, see the history entry, and ask the Ask tab the same question and get the **new** answer.

---

## Phase 5: Knowledge Time Machine (the truth-decay "wow" moment)

Adapt `WaveformScrub.tsx` into `TimeMachine`, a card at the top of the Health tab titled **"What if nobody updates anything?"**

1. Add `GET /api/claims` → for each claim `{id, text, subject_name, fact_type, base_conf, half_life_days, asserted_at, source_count}`.
2. Each **bar** of the waveform = one fact (bar height = its confidence at the scrubbed date, colored by label). Sort bars by subject so related facts sit together.
3. The scrubber goes from **Today** to **+24 months**. Replace "Mom.mp3" with the date label ("Today" / "April 2027"), and the right-hand number with "+6 mo". ▶ plays forward over ~6 seconds; ↺ resets.
4. Under it, one live sentence: "By **April 2027**, **9 of 16** facts will be probably outdated, including who owns **billing-service**." Recomputed with `lib/confidence.ts` as you drag. Pure frontend, no LLM.
5. Hovering a bar shows a tiny tooltip: the fact in plain text + its label at that date.
6. Button "Ask Vera to refresh the riskiest 3" → creates Vera questions for the three facts that cross the 60% floor soonest (new `POST /api/vera/ask {claim_ids}` → VerifyTasks, Layer 3 only).

**Done when:** dragging the scrubber visibly turns bars from green → orange → red and the sentence updates live.

---

## Phase 6: People *(do only if Phases 0–5 are done and tested)*

1. **PersonCard:** adapt `EditProfile.tsx` as a **read-only** card (remove the edit form). Opens as a sheet that grows from whatever name/avatar was clicked. Shows: initials avatar, name, role, team, pill "Active" or "Left the company", "Looks after:" system chips (OWNS without `until`), "Knows about:" topics from facts they authored, "Last confirmed something: 3 weeks ago". Footer: `WatchToggle` + "Ask SPINE about {first name}". Use `GET /api/entity/{id}` (currently unused) and extend it to return team, owned systems and authored topics.
2. Make every person chip/avatar in the app open the PersonCard.

---

## Phase 7: First week + Teach SPINE *(only if ahead)*

1. **Welcome sheet (first visit only):** small sheet with `TextField` (adapt `FloatingInput.tsx`) "What should we call you?" and the line "SPINE is Northwind's memory. Ask it anything, and it tells you how sure it is." Optional on top: `Wordmark` (adapt `reactbits/TechText.jsx`, `text="SPINE"`, `intro="assemble"`, `labels={false}`, `specks={8}`, height 160px, dynamic + ssr:false). Save the name in localStorage and use it in the greeting.
2. **FirstWeek:** adapt `OnboardingChecklist.tsx` (remove its internal theme state). Floating, bottom-left, translucent. Steps complete **automatically** when actually done (localStorage):
   1. "Ask SPINE your first question"
   2. "Find out who owns the billing service" (an answered question mentioning billing)
   3. "Run a health check"
   4. "Help Vera with one question"
   5. "Look at the knowledge map"
   Clicking an unfinished step takes you there (and pre-fills the question). A finished step's circle springs into a green check (bounce 0.2), the only celebration. At 5/5: "You know your way around Northwind 🎉", dismissable forever.
3. **TeachSpine:** adapt `FloatingDisclosure.tsx`. Floating "+" bottom-right. Items:
   - "Someone new looks after a system"
   - "This info is outdated"
   - "Two documents disagree"
   - "Ask Vera something"
   Each opens the `VeraQuestion` flow pre-filled (pick the system/person via the same `@` list). Submitting goes through the **same Vera response path** (new `POST /api/teach {kind, subject_id, statement}` → creates a VerifyTask + immediately records the human's Response → runs the same LLM parse as `/api/vera/respond`). Trust rule intact: a human statement, stored raw, supersedes, never deletes. Uses `UndoToast` too.

---

## Phase 8: Voice *(optional, only if everything else is done)*

1. Backend `POST /api/transcribe` (multipart audio) → Groq `whisper-large-v3-turbo` → `{text}`.
2. `AskBar`: add `onDictate` using `MediaRecorder` (tap to start, tap to stop) → transcribe → text goes into the bar. **Never auto-send.**
3. `VoiceAnswer`: adapt `VoiceNote.tsx` as a "🎙️ Say it instead" option in Vera's Card 1 → transcribe → fill the textarea for the user to review → normal send. Store `source:'voice'` on the Response node.
4. In Vera history, voice answers can replay with their transcript using `TranscribeVoiceMessage.tsx` (only if audio is kept; otherwise show text only).

---

## Phase 9: Final polish + QA (always do before deploying)

1. Run the **demo script** end to end and fix anything rough:
   1. Open → greeting + ASCII glow → Meet the team.
   2. Ask "Who owns @billing-service?" → thinking line → red "Probably outdated" + heads-up.
   3. Open "How I found this" → Show query → Show me the map.
   4. Health → Run health check → tiles → "Only one person knows this" → fix-it plan.
   5. Time machine → drag to +12 months → "Ask Vera to refresh the riskiest 3".
   6. Vera → orb energetic → answer "Something changed: Sam Okafor looks after it now" → undo → send → orb settles → history shows it.
   7. Ask the same question again → the **new** answer, now 🟢 "Up to date".
2. Reduced motion on (OS setting): nothing slides or bounces, WebGL backgrounds are still.
3. Only one WebGL canvas alive at a time. Check with DevTools (no runaway GPU when on Health).
4. Light and dark both look right. No hardcoded colors left (grep for `#` hex in `components/ui` outside `_source`).
5. Lighthouse accessibility ≥ 90 on the Ask tab.
6. `grep` for any id-looking strings rendered (`claim-`, `vtask-`, `finding-`). There should be none in the UI.
7. Update `ARCHITECTURE.md` with the new frontend structure (views, components, new endpoints) so I can explain it to judges.

**Phase Report for Phase 9:** the demo script results, step by step, ✅/❌.
