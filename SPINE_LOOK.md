# SPINE — THE LOOK (floating glass)

This document replaces the visual direction in `SPINE_REDESIGN.md` Part C and Phase 2.1.
Everything else in `SPINE_REDESIGN.md` (phases, component map, plain-language labels, trust rule,
no-raw-ids rule, Phase Report rule) still applies.

**Do this as one job. Do not start the other phases until I say so.**

---

## 1. THE IDEA IN ONE LINE

One living background. Everything else floats on top of it in glass.

```
┌──────────────────────────────────────────────────────┐
│  ░░▒▒▓▓ animated ASCII gradient — ALWAYS BEHIND ▓▓▒▒░░ │
│                                                        │
│      ╭────────────────────────────────────╮            │  ← frosted glass
│      │   glass card, blurred, thin border  │            │     floats above it
│      ╰────────────────────────────────────╯            │
│                                                        │
│   ╭──────────────────────────────────────────╮         │
│   │  another glass card                       │         │
│   ╰──────────────────────────────────────────╯         │
│                                                        │
│          ╭────────────────────────╮                    │  ← floating glass tab bar
│          │  Ask   Health   Vera    │                    │     (bottom, not top)
│          ╰────────────────────────╯                    │
└──────────────────────────────────────────────────────┘
```

Nothing is a flat white box on a flat grey page any more. Every panel is glass with the
background showing through it.

---

## 2. THE BACKGROUND (one canvas, whole app, never unmounts)

Use `reactbits/GradientASCII.jsx` from `_source`. It is installed via
`npx shadcn@latest add @react-bits/GradientASCII-JS-CSS` if the file is missing.

Create `app/components/Backdrop.tsx`. It is rendered **once**, in `app/layout.tsx`, as a
`fixed inset-0 -z-10` layer. It is **not** per-tab, it is **not** unmounted when an answer
appears, it does **not** move or scroll. Load it with `next/dynamic` + `{ ssr: false }`.

Use these exact settings (this is the preset I picked, do not re-tune it):

```jsx
<GradientASCII
  colors={["#1e3fd8","#f6f8ff","#a5d8ff","#4dcaff"]}
  shape="horizon"
  characters=" =+xX0S8#@"
  cellSize={18}
  density={0.8}
  glyphOpacity={0.85}
  glow={0.2}
  depthOfField={0}
  flicker={0.2}
  softness={0.5}
  scale={1}
  flow={0.5}
  speed={1}
  gradientOpacity={0.9}
  grain={0.08}
  variation={0}
  mouseInteraction
  scrambleRadius={0.1}
  clickEffect="wave"
  intro
  lightMode={false}
/>
```

Rules for the backdrop:

- **Light theme:** same colors, `lightMode={true}`.
- **Dark theme:** exactly as written above, `lightMode={false}`.
- It sits behind a readability scrim: a single `div` over the canvas, still behind content,
  with `bg-background/55` in light and `bg-black/45` in dark, plus a top-to-bottom gradient
  that is slightly stronger in the middle third where the text lives. Tune the scrim until
  body text passes 4.5:1 contrast — **text wins over prettiness, always**.
- `mouseInteraction` stays on. The click wave stays on. That is the "alive" feeling.
- `prefers-reduced-motion`: render the canvas with `speed={0}` `intro={false}` `flicker={0}`
  (a still image, not a removed one).
- If WebGL2 is unavailable, fall back to a CSS radial-gradient of the same four colors.
- This is the **only** WebGL canvas in the app now. VeraOrb (`CrystalizedBall`) is cut —
  replace it with a CSS-only glass sphere (see §5). The one-canvas-at-a-time rule in
  `SPINE_REDESIGN.md` is satisfied because there is exactly one, forever.

---

## 3. THE GLASS (this is the part that must actually change)

Add to `globals.css`, as real utility classes, and **use them everywhere a card, bar, modal,
pill or tile is drawn**. If a surface in the app is not using one of these, it is a bug.

```css
@layer utilities {
  .glass {
    background: color-mix(in srgb, var(--card) 55%, transparent);
    backdrop-filter: blur(28px) saturate(180%);
    -webkit-backdrop-filter: blur(28px) saturate(180%);
    border: 1px solid color-mix(in srgb, var(--foreground) 10%, transparent);
    box-shadow:
      0 1px 0 0 color-mix(in srgb, #fff 45%, transparent) inset,
      0 8px 32px -8px rgb(0 0 0 / 0.28),
      0 2px 8px -2px rgb(0 0 0 / 0.16);
  }
  .glass-strong { /* same, 72% card, blur(40px) — for modals and the answer card */ }
  .glass-thin   { /* same, 38% card, blur(18px) — for pills, chips, small tiles */ }
}
```

Dark theme: the inset highlight drops to `#fff 12%`, the border goes to
`color-mix(in srgb, #fff 14%, transparent)`, the outer shadow deepens to `0.5`.

`@supports not (backdrop-filter: blur(1px))` → solid `var(--card)` at 96%. Never let text
land on a transparent surface with no blur.

Also respect `prefers-reduced-transparency`: swap all three classes to solid card.

### Shape and spacing

- Radii go **up**: cards `28px`, modals `32px`, pills and chips `999px`, small tiles `20px`.
  Rounded-rectangle, iOS style. No sharp corners anywhere.
- Content column stays `880px`, centred.
- Vertical rhythm between floating cards: `24px`.
- Every glass surface sits on `padding: 24px` minimum (pills `10px 16px`).

### The float

Glass cards are not glued to the page — they hover.

- On mount: fade in from `opacity 0, y 12px, scale .98` → settled, `0.4s`, spring bounce `0`.
- On hover (cards that are clickable only): lift `y -2px` and deepen the outer shadow, `0.25s`.
- On press: `scale .985` **immediately on pointer-down**, not on release.
- Cards never animate their blur or background (it costs frames). Only transform, opacity, shadow.

---

## 4. LAYOUT CHANGES YOU MUST MAKE

1. **The top bar goes away.** The tab bar (`FluidTabs` → `TabBar`) becomes a **floating glass
   pill, fixed at the bottom centre**, `glass` class, `bottom: 24px`, with the three tabs
   Ask / Health / Vera and their badge counts. On mobile it stretches to `calc(100% - 32px)`.
2. **The brand** ("SPINE" + the line "Every other company brain waits to be asked. This one
   asks you.") moves to the top of the Ask view as plain text over the backdrop — no box
   around it, no card. Large, light weight, tight tracking.
3. **The ask box** (`PromptBar` → `AskBar`) becomes a floating `glass-strong` capsule, full
   radius, sitting in the middle of the Ask view when empty, and animating up to just above
   the tab bar once the first answer exists. That one movement is the signature interaction —
   use a single layout animation (`motion/react` `layout` prop), 0.4s, bounce 0.
4. **The answer** appears as a `glass-strong` card above the ask box, scrolling behind the
   floating bars, never pushing them.
5. **Health tiles and problem rows**: `glass-thin`, in a 2-column grid that collapses to 1.
6. **Every modal / sheet**: `glass-strong` over a `bg-black/30 backdrop-blur-sm` page scrim.

---

## 5. VERA, WITHOUT WEBGL

Delete `CrystalizedBall` from the plan. VeraOrb is now a pure CSS/SVG object:

- A `220px` circle with a radial gradient from `#AF52DE` to transparent, a
  `backdrop-filter: blur(20px)` glass shell over it, and an inner white highlight arc
  at the top left.
- Idle: a slow `6s` breathe (scale `1 → 1.03 → 1`) plus a `20s` hue drift.
- When Vera has questions waiting: a second ring pulses outward every `3s` and the orb
  tints warmer. No questions: it just breathes.
- Reduced motion: no breathe, keep the gradient.

---

## 6. WHAT "PROFESSIONAL" MEANS HERE (hard limits)

- Max **3** font sizes on any screen plus one small caption size.
- Font weights: 400 body, 500 labels, 600 headings. Never 700+.
- Colour is carried by the backdrop. Content text is `--foreground` / `--muted-foreground`
  only. The four status colours (fresh / aging / stale / vera) appear **only** in dots,
  pills and bars — never as card backgrounds, never as large blocks.
- No emoji in the UI chrome. The confidence dots are coloured circles, not emoji.
- No gradients on buttons. Buttons are glass or solid `--primary`, nothing else.
- No drop shadows on text. If text is hard to read, fix the scrim, not the text.

---

## 7. ACCEPTANCE — I WILL CHECK THESE

Do not report done until all of these are true:

1. On every tab, the animated background is visible behind the content and **does not restart**
   when I switch tabs.
2. Every card, bar, tile, pill and modal shows the background blurred through it.
3. The tab bar floats at the bottom and is glass.
4. Body text on every surface passes 4.5:1 contrast in **both** light and dark.
5. `npm run build` passes, 0 Next.js dev issues, tsc and eslint clean.
6. The page holds 60fps while scrolling with the backdrop running (check Performance tab).
7. Reduced motion and reduced transparency both produce a still, solid, readable app.
8. Toggling light/dark re-tints the backdrop without a page reload and without a flash.

---

## 8. PHASE REPORT

When finished, give me:

- What changed, in plain words.
- The list of files touched.
- Anything that fought back (perf, blur cost, contrast).
- Exactly what to click to see the difference.
- A screenshot of the Ask screen in dark and in light.
