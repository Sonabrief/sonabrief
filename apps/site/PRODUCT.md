---

# Brand register

When design IS the product: marketing sites, landing pages, brand surfaces,
anything where the first impression IS the conversion. The visitor has no
task yet — they're deciding whether to trust.

## The brand slop test

Not "would someone say AI made this." The test is: would someone screenshot
this section and share it on X or HN? Would a designer open DevTools to
see how it was built? Brand UI's failure mode is forgettable competence —
technically correct, emotionally inert. The bar is memorability within
restraint.

Sonabrief's register: **editorial refined**. The model is a long-form
magazine that also sells software. Calm. Authoritative. Honest to the point
of discomfort. Not cold — warm through precision, not decoration.

## Typography

- **Plus Jakarta Sans** for all headings (H1–H3), large numbers, display text.
- **Manrope** for body, UI labels, form elements, metadata, nav links.
- **Instrument Serif italic** ONLY for the word "brief" in the Sonabrief
  wordmark. Never use it elsewhere on the site.
- Fluid headings on landing (clamp): H1 clamp(40px, 5vw, 72px).
- Line-height 1.7 for body prose. 1.1–1.2 for display headings.
- Max line length: 65ch for prose sections, 48ch for pull quotes/manifesto.
- Letter-spacing: -0.02em on large headings, 0.08em on small uppercase labels.

## Color

Palette is fixed. Never deviate, never introduce new colors.

- **Deep Teal #1A4D52** — primary headings, CTA buttons, key accents
- **Amber #C89868** — "brief" wordmark, Pro badge, micro-accents only
- **Cream #FAF7F0** — primary background (light mode)
- **Charcoal #1A1A1F** — body text (light), primary background (dark mode)
- **Stone #8B8B92** — secondary text, labels, nav links at rest
- **Mist #E8E5DD** — dividers, borders, subtle separators
- **Signal Red #B84545** — errors only
- **Signal Green #5A7D5A** — success only

One deliberate dark section per page maximum: the open-source section uses
Deep Teal background with Cream text. This is the only full-width dark
section. It gives visual rhythm and signals importance.

Dark mode (prefers-color-scheme: dark): background Charcoal, text Cream,
accents Deep Teal lightened 15%.

## Grain texture

Apply a subtle SVG noise grain texture via .grain-texture (already defined
in global.css). It's a brand signature — keep it on every page.

## Layout

- Generous whitespace. Padding sections: 120px top/bottom desktop, 80px mobile.
- Max content width: 1200px centered.
- Prose sections: max-width 720px centered.
- Manifesto items: max-width 600px, left-aligned with number prefix.
- Asymmetry is allowed and encouraged on hero and manifesto sections.
- Never more than 2 levels of card elevation.

## Motion

Motion conveys meaning, not decoration. Every animation has a reason.

- **Fade-up on scroll**: opacity 0→1 + translateY 24px→0, 400ms ease-out,
  triggered once on first scroll-into-view. Never loops.
- **Page transitions**: AnimatePresence (Motion library) — simple fade,
  200ms. Not a slide or zoom.
- **Lenis smooth scroll**: only on long pages (landing, /pricing, /security).
- **SVG illustrations**: animate once on first scroll-into-view, then static.
- **Accordion FAQ**: CSS max-height transition, 300ms ease-out.
- **Pricing toggle**: smooth label swap + price transition, 250ms.
- **CTA primary BorderBeam**: subtle, calm (already in app). Not sparkle.
- **Wordmark**: S and B compose from lines on first load, once, 600ms.
  Amber leaf micro-parallax on scroll.

prefers-reduced-motion: ALL animations skip. No exceptions.

## CTA hierarchy

**Primary**: "Try Sonabrief free" → https://app.sonabrief.com/signup
Deep Teal solid, rounded-full, Manrope 15px medium. Always visible in navbar.

**Secondary**: "See pricing" / "View on GitHub" — outline or text link.
Never more prominent than primary.

**Tertiary**: newsletter form in footer — minimum visual weight.

Never use: "Start free trial", "Book a demo", "Get started today!",
exclamation marks anywhere, urgency language, FOMO.

## Components

- **Navbar**: sticky, 64px desktop / 56px mobile, cream background,
  mist border-bottom. Logo symbol mark left, nav links center, CTA right.
- **Footer**: 3 columns + bottom row with newsletter form + lang switcher.
- **AccordionFAQ**: one open at a time, aria-expanded, CSS height transition.
- **PricingCard**: 4 columns, highlighted card has Deep Teal border.
- **ManifestoItem**: number (Amber, large, Plus Jakarta Sans), title,
  body, verify link. Vertical stack, generous spacing.
- **ThreeWaysCard**: three columns, Cloud Veloce/Fast/Rapide/etc has
  badge (Amber, Manrope uppercase tiny). No "Recommended" badge.

## Brand bans (absolute)

- Gradient blobs in backgrounds
- Sparkle / shimmer on headlines
- Animated counters with invented numbers ("98% satisfaction")
- Fake testimonials or social proof
- Generic icon libraries — use inline SVG or text symbols
- Repeated geometric patterns in backgrounds
- Neon or fluorescent colors
- Emoji in badges or buttons
- Screenshots of the app in hero (until final app graphic session)
- Exclamation marks anywhere on the site
- Comparison tables with competitor red Xs

## Brand permissions

- Large display typography (H1 up to 72px)
- Generous section padding — whitespace IS a design choice
- Editorially-toned copy that divides the audience deliberately
- One full-width dark section per page
- Asymmetric layouts in hero and manifesto
- Subtle grain texture everywhere
- Amber as accent — sparingly, never as a background fill

---
