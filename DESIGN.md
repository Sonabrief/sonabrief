---
name: Sonabrief
description: Privacy-first AI meeting assistant for professionals with confidentiality needs
colors:
  teal-deep: "#1A4D52"
  teal-hover: "#143A3E"
  amber: "#C89868"
  cream: "#FAF7F0"
  charcoal: "#1A1A1F"
  surface: "#FDFCF9"
  border: "#E2DDD4"
  muted: "#6B7A7B"
  error: "#C0392B"
typography:
  display:
    fontFamily: "Plus Jakarta Sans Variable, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Plus Jakarta Sans Variable, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.teal-deep}"
    textColor: "{colors.cream}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.teal-hover}"
    textColor: "{colors.cream}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.border}"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  badge-free:
    backgroundColor: "{colors.border}"
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    padding: "3px 10px"
  badge-pro:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.teal-deep}"
    rounded: "{rounded.full}"
    padding: "3px 10px"
  badge-unlimited:
    backgroundColor: "#F5EFE4"
    textColor: "#7A5C30"
    rounded: "{rounded.full}"
    padding: "3px 10px"
---

# Design System: Sonabrief

## 1. Overview

**Creative North Star: "The Trusted Workroom"**

Sonabrief's interface is a private professional space — quiet, ordered, and precise. The visual language is not warm and approachable; it is trusted and competent. Where a consumer product might use softness to lower resistance, Sonabrief uses clarity to signal that something serious is happening here. Every screen should feel like opening a well-organized brief: the right information in the right place, nothing else present.

The palette is restrained: Deep Teal anchors surfaces and actions; Cream provides a warm but serious backdrop; Amber surfaces rarely, only where something needs to be noticed (quota warnings, upgrade moments, unlimited status). Plus Jakarta Sans at heavy weights gives headings authority through mass and tight spacing. Manrope keeps body copy professional and readable at small sizes without the cold neutrality of a geometric sans.

This system explicitly rejects: Notion and Coda's casual collaborative-wiki aesthetic; the "friendly startup" softness of generic SaaS cream products with rounded-everything layouts; the consumer meeting-recorder look of tools like Otter.ai and Fireflies; and the intimidating density of heavy enterprise UI. If the interface could plausibly belong to any of those, something has gone wrong.

**Key Characteristics:**
- Restrained color strategy: Teal and Cream carry the surface; Amber is used in ≤10% of any screen
- Serif headings with structured sans body — authority and legibility, not decoration
- Flat surfaces with tonal depth, no decorative shadows
- Left-aligned, structured layouts on app screens; center-alignment reserved for auth and error states
- Precise, expert copy: no exclamation marks, no marketing adjectives in the UI

## 2. Colors: The Workroom Palette

A focused palette of two primaries and one strategic accent. Every color earns its place by role; nothing is applied for variety.

### Primary
- **Deep Teal** (`#1A4D52` / `oklch(32% 0.053 194)`): The structural color. Used for the primary action button background, links, active navigation states, the quota progress bar fill, and the brand wordmark. Appears on ≤60% of any given screen. Its hover state is Teal Hover (`#143A3E`), a direct darkening without hue shift.

### Secondary
- **Amber** (`#C89868` / `oklch(67% 0.083 62)`): The signal color. Used only for the Unlimited tier badge, quota warnings at >80% usage, and upgrade prompts. Never used decoratively. Its rarity is the point.

### Neutral
- **Cream** (`#FAF7F0` / `oklch(98% 0.010 88)`): The page background. Warm enough to feel human, not warm enough to feel friendly.
- **Surface** (`#FDFCF9` / `oklch(99% 0.005 88)`): Card and panel backgrounds. Near-white, tinted toward Cream so cards read as slightly elevated without a visible shadow.
- **Charcoal** (`#1A1A1F` / `oklch(14% 0.007 280)`): Primary text. Near-black with a cool undertone that holds contrast against Cream without the harshness of pure black.
- **Border** (`#E2DDD4` / `oklch(90% 0.008 88)`): Dividers and card outlines. Warm, not gray — tinted toward Cream so boundaries feel structural, not imposed.
- **Muted** (`#6B7A7B` / `oklch(52% 0.010 194)`): Secondary text, labels, and supporting information. Has a slight teal character that keeps it cohesive with Deep Teal without competing.
- **Error** (`#C0392B` / `oklch(46% 0.155 28)`): Destructive actions and validation errors only.

### Named Rules
**The Amber Scarcity Rule.** Amber is a signal, not a palette member. It appears on at most one element per screen. If two things need to be amber, one of them is wrong.

**The Chromaless Ceiling Rule.** Pure `#000` and `#fff` are prohibited. Every neutral is tinted toward the brand hue. Charcoal carries a cooler undertone; Cream and Surface carry a warm one. Zero-chroma neutrals fail the "trusted workroom" atmosphere.

## 3. Typography

**Display Font:** Plus Jakarta Sans Variable (with system-ui, sans-serif as fallback)
**Body Font:** Manrope Variable (with system-ui, sans-serif as fallback)

**Character:** Plus Jakarta Sans at weight 800 carries authority through mass, not serifs — tight letter-spacing and high contrast between strokes give headings presence without ornamentation. Manrope at 400 reads clean and neutral at small sizes. The pairing works through weight contrast: Display at 800 vs. Body at 400 is a 2× difference that creates clear hierarchy within the same type category (geometric sans).

### Hierarchy
- **Display** (800, clamp(1.875rem, 4vw, 3rem), 1.1 leading, −0.02em tracking): Screen-level headings. Plus Jakarta Sans. Page titles on dashboard and key screens only.
- **Headline** (700, 1.5rem, 1.2 leading, −0.015em tracking): Section titles, modal headers, prominent labels. Plus Jakarta Sans. Used sparingly; one per surface maximum.
- **Title** (600, 1rem, 1.4 leading): Subsection heads, card titles, sidebar section labels. Manrope. Carries structure.
- **Body** (400, 0.875rem, 1.6 leading): All running copy, descriptions, and form help text. Manrope. Cap line length at 65–75ch on prose content.
- **Label** (500, 0.75rem, 1.4 leading, +0.01em tracking): Metadata, timestamps, status values, badge text, input labels. Manrope. Never lowercase unless it is a proper name.

### Named Rules
**The Weight Contrast Rule.** Plus Jakarta Sans owns hierarchy through mass (800 Display, 700 Headline). Manrope owns density (600 Title, 400 Body, 500 Label). Adjacent hierarchy levels must differ by at least 1.25× in size or one full weight step — never both the same size and the same weight.

**The Scale Contrast Rule.** Adjacent text elements must differ by at least 1.25× in size OR at least one weight step. Flat scales (all 0.875rem, all regular weight) produce walls of text that read as bureaucratic. This product is precise, not dense.

## 4. Elevation

Sonabrief uses **tonal elevation**, not shadow elevation. Depth is conveyed through background color steps (Cream → Surface → Border), not through box-shadow. A card that sits on Cream uses Surface as its background; a nested panel uses Border as its background. No decorative drop shadows.

The exception is interactive state: focused inputs receive a `box-shadow: 0 0 0 2px #1A4D52` ring (2px, solid Deep Teal, no blur spread). This is a focus affordance, not elevation.

### Named Rules
**The Flat-By-Default Rule.** No surface has a shadow at rest. Shadow may appear only as a focus ring, never as ambient decoration. If a component needs a shadow to feel "elevated," rethink whether cards are the right affordance for that content.

## 5. Components

### Buttons

Buttons are direct and functional. No animated gradients, no loading spinners that persist, no border-left accents.

- **Shape:** Gently rounded (8px radius). Not pill-shaped; not square.
- **Primary:** Deep Teal background (`#1A4D52`), Cream text (`#FAF7F0`), 10px top/bottom × 16px left/right padding. Font: Manrope 500 0.875rem.
- **Hover / Focus:** Teal Hover background (`#143A3E`), no scale transform, no bounce. Focus visible: 2px Deep Teal ring, 2px offset.
- **Ghost:** Transparent background, Charcoal text, Border (`#E2DDD4`) on hover. Used for secondary navigation actions.
- **Destructive:** Error red background tint with deep red text; follows shadcn's `destructive` variant pattern.

The `rounded-4xl` default in `button.tsx` (which produces pill-shaped buttons) should be overridden to `rounded-md` for all Sonabrief buttons. Pill shapes belong to consumer products.

### Badges / Chips

Tier badges and status chips. Small, legible, never decorative.

- **Free tier:** Border-tinted background (`#E2DDD4`), Muted text (`#6B7A7B`), full-radius pill, 3px × 10px padding, Label typography.
- **Pro tier:** Surface background, Deep Teal text — signals "active plan" without emphasis.
- **Unlimited tier:** Warm amber tint (`#F5EFE4`) background, deep amber text (`#7A5C30`). The one moment Amber enters a badge. No `✓` emoji — use a Unicode checkmark (`✓`) or none at all.

### Cards / Containers

- **Corner Style:** Gently rounded (12px radius on primary cards, 8px on nested panels).
- **Background:** Surface (`#FDFCF9`) on Cream backgrounds. Border (`#E2DDD4`) as the card outline.
- **Shadow Strategy:** None. See Elevation above.
- **Border:** 1px Border-color all sides. Not thicker on any side; no left-stripe accents.
- **Internal Padding:** 20px (md + xs) horizontally, 16px vertically as a baseline. Vary intentionally for rhythm; do not apply the same padding everywhere.

### Inputs / Fields

- **Style:** 1px Border stroke, Surface background, 8px radius.
- **Focus:** Drop the border color to Deep Teal, add 2px focus ring in Deep Teal at 30% opacity. No glow spread.
- **Error:** Border shifts to Error red; error message in Error red, Label weight, below the field.
- **Disabled:** 40% opacity, cursor not-allowed.

### Navigation

Navigation items are ghost-style: transparent background, Charcoal text, Border-hover on interaction. Active state uses Deep Teal text with a Teal-tinted surface background. No underlines on nav items. No left-stripe active indicators — use background tint instead.

Typography: Body weight (400) at rest, Title weight (600) on active state. No uppercase labels.

### Quota Progress Bar

The one bespoke component requiring documentation because it has brand-specific color logic.

- **Container:** Full-width, 6px height, Border background, 9999px radius.
- **Fill:** Deep Teal up to 80% usage. Error red (`#C0392B`) above 80% — the threshold where Amber's scarcity rule would make amber feel casual. Red is the only non-Teal color allowed on a progress fill.
- **Accessible:** Must carry `role="progressbar"`, `aria-valuenow`, `aria-valuemin={0}`, `aria-valuemax={100}`, and a visually-hidden text label describing the quota used.
- **Transition:** `transition: width 300ms ease-out` only. Do not animate color; do not animate height. Reduce-motion: remove the transition entirely at `@media (prefers-reduced-motion: reduce)`.

## 6. Do's and Don'ts

### Do:
- **Do** use Deep Teal (`#1A4D52`) as the structural primary — for buttons, active states, brand wordmark, and quota fill.
- **Do** reserve Amber (`#C89868`) for Unlimited status and >80% quota warnings. One Amber element per screen, maximum.
- **Do** use Plus Jakarta Sans Variable (weight 800/700) exclusively for Display and Headline roles. Manrope for Title, Body, and Label.
- **Do** tint every neutral toward the brand hue. Surface is `#FDFCF9`, not `#FFFFFF`. Charcoal is `#1A1A1F`, not `#000000`.
- **Do** use tonal layering for depth: Cream → Surface → Border, in that order, as surfaces nest.
- **Do** left-align content on authenticated app screens. Center-alignment is for auth flows, error states, and empty states only.
- **Do** add `role="progressbar"` and full ARIA attributes to the quota bar.
- **Do** include `@media (prefers-reduced-motion: reduce)` on every CSS transition and animation.
- **Do** cap body copy at 65–75ch line length.
- **Do** use weight contrast (≥1.25 ratio between adjacent hierarchy steps) alongside size to create visual hierarchy.
- **Do** write button copy in the imperative: "New meeting", "Manage subscription". No informal `+` prefix on primary CTAs.

### Don't:
- **Don't** use `#000000` or `#ffffff` anywhere. Every neutral is tinted.
- **Don't** use `border-left` or `border-right` thicker than 1px as a colored accent on cards, list items, or alerts. This is the side-stripe anti-pattern. Use background tints or full borders instead.
- **Don't** use gradient text (`background-clip: text` + gradient). Single solid color for all text; emphasis via weight or size.
- **Don't** use glassmorphism (`backdrop-filter: blur`) decoratively. Not used in Sonabrief.
- **Don't** display a "hero metric" template (big number, small label, supporting stats, gradient accent). The quota card is functional data, not a dashboard boast.
- **Don't** render identical-sized cards in an icon + heading + text grid. This is the "generic SaaS" anti-pattern Sonabrief explicitly rejects.
- **Don't** reach for a modal as the first solution. Exhaust inline and progressive alternatives before adding a modal.
- **Don't** mix Tailwind's generic semantic colors (`bg-teal-50`, `text-teal-700`, `text-amber-700`) with the brand palette. Tailwind's teal is a different hue from Deep Teal `#1A4D52`. Use the CSS custom properties exclusively.
- **Don't** hardcode brand hex values inline (`bg-[#1A4D52]`, `text-[#FAF7F0]`). Wire brand tokens to the CSS custom property layer; use semantic Tailwind classes (`bg-primary`, `text-primary-foreground`).
- **Don't** apply `font-family` via a `style` prop. Use the `font-heading` and `font-sans` Tailwind utilities exclusively.
- **Don't** design to look like Notion, Coda, Otter.ai, Fireflies, or "generic SaaS cream." If the interface could pass for any of those, rework the surface.
- **Don't** use emoji in UI copy or component labels. Use Unicode punctuation or text only.
- **Don't** apply `text-center` to authenticated dashboard or list screens. It signals a login page, not a professional tool.
