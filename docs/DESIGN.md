---
name: MADFAM CV
description: One profile, a CV tailored to every job — made with the care of a tailor's atelier.
colors:
  ivory-ground: "#f7f4ec"
  linen-surface: "#fffdf9"
  ink: "#141a16"
  sage-muted: "#4b5650"
  thread-line: "#dcd8cb"
  forest: "#1f5c45"
  forest-ink: "#ffffff"
  antique-brass: "#a7802f"
  brass-ink: "#141a16"
  chalk-tag: "#eeebe0"
  live-wash: "#e0ece3"
  live-ink: "#134131"
  focus-ember: "#b4530a"
  dark-ground: "#121513"
  dark-surface: "#1a1f1c"
  dark-ink: "#eeefe9"
  dark-forest: "#86d3b0"
typography:
  display:
    fontFamily: "Newsreader, 'Iowan Old Style', Georgia, serif"
    fontSize: "clamp(2.1rem, 5vw, 3.4rem)"
    fontWeight: 540
    lineHeight: 1.08
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Newsreader, 'Iowan Old Style', Georgia, serif"
    fontSize: "clamp(1.5rem, 3vw, 2rem)"
    fontWeight: 540
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  title:
    fontFamily: "'Instrument Sans', system-ui, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 650
    lineHeight: 1.15
  body:
    fontFamily: "'Instrument Sans', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Instrument Sans', system-ui, sans-serif"
    fontSize: "0.92rem"
    fontWeight: 600
    lineHeight: 1.4
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.92rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "999px"
  card: "14px"
  field: "10px"
  small: "6px"
spacing:
  gutter: "1.25rem"
  gutter-phone: "1rem"
  max-width: "72rem"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.forest-ink}"
    rounded: "{rounded.control}"
    padding: "0.8rem 1.3rem"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.forest}"
    rounded: "{rounded.control}"
    padding: "0.8rem 1.3rem"
  card:
    backgroundColor: "{colors.linen-surface}"
    rounded: "{rounded.card}"
    padding: "1.25rem"
  input:
    backgroundColor: "{colors.linen-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
  tag:
    backgroundColor: "{colors.chalk-tag}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
---

# Design system: MADFAM CV

> Last Updated: 2026-11-16 (components: compact lists, editors with a save button, print view). Written with the Impeccable skill's `document` step (scan mode) from the code on `main`
> and the owner's answers of 2026-11-15. Tokens are normative; the stylesheet (`apps/web/src/app/globals.css`) is
> their source of truth, and this file changes in the same pull request as any token.

## Overview

**North star: The Tailor's Atelier.** cv cuts one person's career to measure for each job. The interface behaves like
a good atelier: calm, exact, unhurried, nothing on the table that is not part of the work. Quiet luxury, never
ornament: ivory and ink, one forest green, a serif voice for names and titles, a precise sans for everything you
operate. The persona sets the bar: a luxury-retail professional who judges presentation for a living and searches
while employed, so restraint and discretion read as quality, and noise reads as risk.

Modes (Impeccable): the landing is **Persuade**, the app is **Operate**, the pages a recruiter opens (CV, portfolio,
presentation) are **Experience**, the privacy notice and the reader page are **Read**.

Anti-references: a generic SaaS dashboard (cards of icon + heading + text, gradients, glass); a «creative résumé»
template (two columns, skill bars, photos); anything that looks like it is selling the person rather than presenting
them.

## Colors

- **Ivory ground** (`#f7f4ec`) and **linen surface** (`#fffdf9`): the paper the work sits on. Never pure white
  on screen.
- **Ink** (`#141a16`): text and the strongest marks; a green-tinted near-black, never `#000` on screen.
- **Sage muted** (`#4b5650`): secondary text; 6.9:1 on the ground.
- **Thread line** (`#dcd8cb`): borders and rules; the only way surfaces separate besides space.
- **Forest** (`#1f5c45`): the one brand colour — primary actions, links, the current section. Used sparingly so it
  keeps meaning.
- **Antique brass** (`#a7802f`): the single accent, for attention that is not an action (warnings, the bookmark
  tool, a chart marker). Text on brass is always **brass ink** (`#141a16`), in both themes.
- **Focus ember** (`#b4530a`): focus rings only.
- Dark theme mirrors the roles (`#121513` ground, `#1a1f1c` surface, `#eeefe9` ink, `#86d3b0` forest,
  `#d7b06a` brass); chosen by `prefers-color-scheme`.

## Typography

Two self-hosted typefaces (owner's choice, 2026-11-15), both SIL Open Font License 1.1, Latin subset, variable weight,
served from cv's own origin (`apps/web/src/fonts`, `next/font/local`):

- **Newsreader** — the serif voice: page titles (`h1`, `h2`), the wordmark, names on documents, the «Clásica» CV and
  «Formal» letter. Weight 540 at display sizes; hierarchy comes from size and face, not heaviness.
- **Instrument Sans** — the working voice: body, controls, labels, `h3`, and the «Básica» and «Compacta» documents.

Rules: body 1.0625rem / 1.6; reading measure 65–75ch; headings balanced (`text-wrap: balance`); documents keep
`font-variant-ligatures: no-common-ligatures` so «fi» reaches the PDF text layer as letters (ATS). No third typeface;
monospace only for code (the reader page's robots example).

## Layout

- One centred column of at most 72rem, gutter 1.25rem (1rem on phones).
- App pages are **Operate**: the page's own title is the first thing below the top bar on every size. The account
  actions live in one menu in the bar; the section nav is one row, scrolling sideways below 760px.
- Long tasks progress top to bottom; the primary action of a screen is never below thousands of pixels of optional
  detail (move detail behind a disclosure first).
- Breakpoint: 760px (phone / everything else). Touch targets at least 44px tall.

## Elevation & Depth

Flat by default: surfaces separate by the thread line and by space. Shadow is reserved for things that float above
the page — the account menu, toasts, the paper preview — and always has an offset and a soft blur
(`0 10px 30px -12px rgb(0 0 0 / .28)`). No coloured glows, no hard offset shadows.

## Shapes

- Controls (buttons, tags, the account trigger): fully rounded pills.
- Cards and panels: 14px. Fields: 10px. Small marks: 6px.
- Borders are 1px. No thick one-side stripes on cards, notices or callouts: a notice's tone is its whole border.

## Components

- **Button**: primary = forest fill, white text; secondary = transparent, thread-line border; danger = transparent,
  red border; ghost = no border, underlined. A `<button>` inherits the page's face and size.
- **Notice**: 1px border in its tone's colour, surface fill, title in bold; danger and warning are announced.
- **Account menu**: native `<details>` in the top bar; trigger shows the first name and a drawn chevron; panel lists
  who is signed in and the three actions.
- **Documents** (CV, portfolio, presentation, letter): one column, real text, no images; the person's name heads every
  kind; a document's own title is private and never rendered.
- **Compact lists in documents** (skills, languages, links): wrapping lines with generous gaps, never one item per line
  and never percentages or bars; still a real list for screen readers and the PDF text layer.
- **Editors with a save button** (profile header, document content): a status line says «Sin cambios pendientes» /
  «Tienes cambios sin guardar»; save and discard stay disabled while nothing changed; leaving with unsaved changes
  asks first (the browser's own dialog, `useUnsavedGuard`).
- **Print view**: the page estimate is a plain small line under the paper choice; an offer to switch template is one
  secondary button beside its sentence, never a banner.

## Do's and Don'ts

- **Do** let space and the serif carry hierarchy; keep forest for actions and the current place.
- **Do** say what a control does in the product's own words; errors name the problem and the way out.
- **Do** theme the browser surfaces too: selection, focus ring, link underline offset.
- **Don't** add an eyebrow label above a heading, section numbers, gradient text, glass, or identical card grids
  as page structure.
- **Don't** use emoji or Unicode glyphs as icons; draw them (SVG) or use CSS (the account chevron).
- **Don't** introduce a third typeface, a new accent colour, or a font from outside cv's origin.
