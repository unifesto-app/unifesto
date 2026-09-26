---
name: Unifesto (Mobile)
description: Student-native event app on a true-black canvas — discover, ticket, pay, and connect, with the Unifesto blue as the one glowing accent.
colors:
  primary: "#3491ff"
  primary-bright: "#0062ff"
  background: "#000000"
  background-secondary: "#0a0a0a"
  card: "#0a0a0a"
  text: "#ffffff"
  text-secondary: "#64748b"
  text-muted: "#94a3b8"
  border: "#1a1a1a"
  success: "#10b981"
  warning: "#f59e0b"
  error: "#ef4444"
  brand-gradient-start: "#3491ff"
  brand-gradient-end: "#0062ff"
typography:
  logo:
    fontFamily: "SweetApricot"
    fontSize: "2rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "normal"
  display:
    fontFamily: "Agrandir-Bold"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "Agrandir-Bold"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.25px"
  title:
    fontFamily: "Agrandir-Regular"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "normal"
  body:
    fontFamily: "Agrandir-Regular"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Agrandir-Regular"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.5px"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  "2xl": "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    rounded: "{rounded.full}"
    padding: "12px 16px"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.full}"
    padding: "12px 16px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.background-secondary}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: Unifesto (Mobile)

## 1. Overview

**Creative North Star: "Neon on Black"**

The Unifesto app is a student's pocket to the whole fest circuit — discover events, hold tickets and QR codes, top up a wallet, refer friends, chat, and pay with Razorpay. It lives on a true-black `#000000` canvas that reads as premium and AI-native, letting the Unifesto blue gradient glow like neon against the dark. Where the dashboards work in daylight, the app performs at night: high-contrast white type, a single electric accent, and OLED-friendly black that saves battery and looks expensive.

This is a **native** app, not a website in a shell. Interactions are one-handed and fast — thumb-reachable actions, large touch targets, gestures that feel like iOS and Android rather than a ported web page. Content leads with imagery (event posters, banners) floating on the black; blue is spent carefully on the primary action, the live indicator, and the moments that matter. It is deliberately **not** a generic college app, **not** a cluttered Eventbrite-style feed, and **not** a corporate ticketing utility. The ticket is sacred: a student pulls it up at a gate, on a bad connection, in a hurry — so it must be legible, resilient, and instantly scannable.

**Key Characteristics:**
- True-black `#000000` OLED canvas; high-contrast white type
- Unifesto blue gradient as the one glowing accent
- Mobile-first, one-handed, native gestures and large touch targets
- Image-led content floating on black; blue spent sparingly
- Resilient by design — the ticket/QR works even on poor connectivity

## 2. Colors

A dark, high-contrast palette: pure black as the stage, white as the voice, and the Unifesto blue gradient as the single point of light.

### Primary
- **Unifesto Blue** (`#3491ff`): The glowing accent. Primary CTAs, live/selected states, links, the gradient's bright end.
- **Deep Blue** (`#0062ff`): The gradient's deep end (`#3491ff → #0062ff`, 135°) on primary buttons and hero moments.

### Neutral
- **True Black** (`#000000`): The app canvas. Screen background everywhere.
- **Elevated Black** (`#0a0a0a`): Cards, sheets, inputs — one step off the canvas to signal a surface.
- **White** (`#ffffff`): Primary text, icons, the highest-priority content.
- **Muted** (`#94a3b8`): Secondary text, captions, metadata.
- **Subtle** (`#64748b`): Tertiary text, disabled labels, placeholder.
- **Hairline** (`#1a1a1a`): Borders and dividers on black.

### Status
- **Success** (`#10b981`): Paid, confirmed, checked-in.
- **Warning** (`#f59e0b`): Pending, low balance, expiring soon.
- **Error** (`#ef4444`): Failed payment, invalid ticket, hard errors.

### Named Rules
**The One Point of Light Rule.** On a black screen the blue accent is precious. Spend it on the primary action, the live indicator, and selection — not on decoration. Its glow only works if it's rare.

**The Contrast-on-Black Rule.** Every text and icon meets WCAG AA against `#000000`. Muted grays are for secondary content only; nothing critical relies on low-contrast gray.

## 3. Typography

**Display / Body Font:** Agrandir — `Agrandir-Bold` for emphasis, `Agrandir-Regular` for text
**Logo Font:** Sweet Apricot — the Unifesto wordmark only

**Character:** Agrandir gives the app a clean, confident, modern voice that stays sharp against black. Bold weights carry event titles and hero moments; regular carries the reading text. Sweet Apricot's script is reserved for the brand mark.

### Hierarchy
- **Display** (Bold, 2rem, 1.1, -0.5px): Hero titles, screen headers, event names on detail screens.
- **Headline** (Bold, 1.5rem, 1.25): Section headers, card titles.
- **Title** (Regular, 1.125rem, 1.25): List item titles, sheet headers.
- **Body** (Regular, 1rem, 1.5): Descriptions, chat, reading content.
- **Label** (Regular, 0.6875rem, +0.5px, 1.4): Tab labels, captions, timestamps, metadata.

### Named Rules
**The One Type Voice Rule.** Agrandir does the whole hierarchy through weight and size. Sweet Apricot stays in the logo.

## 4. Elevation

Depth on black is built by **tonal layering**, not big shadows — a surface steps up from `#000000` to `#0a0a0a` to read as "elevated." Cards, sheets, and inputs sit on this slightly-lighter black with hairline `#1a1a1a` borders. The one place light truly "lifts" is the brand gradient: a soft blue glow beneath primary buttons and the live indicator (`shadowColor: #3491ff`), so the accent feels energised rather than flat.

### Shadow Vocabulary
- **Elevated Surface**: tonal shift to `#0a0a0a` + 1px `#1a1a1a` border. The default "this is a card/sheet" treatment.
- **Blue Glow** (`shadowColor: #3491ff, offset 0 8, opacity 0.2, radius 16`): Under primary CTAs and live/selected elements only. Makes the accent glow.

### Named Rules
**The Tonal-Depth Rule.** On black, elevation is a lighter shade of black plus a hairline border — not a heavy drop shadow. The only real glow belongs to the blue accent.

## 5. Components

### Buttons
- **Shape:** Pill / fully rounded (`rounded.full`).
- **Primary:** Blue gradient (`#3491ff → #0062ff`, 135°), black text, ≥44px min height, `12px 16px` padding, soft blue glow beneath. The one hero action per screen.
- **Secondary:** Elevated-black `#0a0a0a` fill, white text, hairline border — "Back", "Share", secondary flows.
- **Pressed:** Subtle scale-down / opacity dip (native touch feedback), not a color flip.

### Cards / Containers
- **Corner Style:** 16px radius (`rounded.lg`); larger sheets use 20–24px.
- **Background:** Elevated black `#0a0a0a` on the true-black canvas.
- **Elevation:** Tonal step + 1px `#1a1a1a` border (see Elevation). Event cards lead with the poster image.
- **Internal Padding:** 16px (`spacing.md`).

### Inputs / Fields
- **Style:** `#0a0a0a` background, hairline `#1a1a1a` border, 12px radius, white text, `#64748b` placeholder, ≥44px tall for thumbs.
- **Focus:** Border shifts to blue `#3491ff`.
- **Error:** Border and helper text shift to `#ef4444`.

### Navigation
- **Style:** Bottom tab bar on black — icon + 0.6875rem label. Active tab in blue `#3491ff`, inactive in muted `#94a3b8`. Large, thumb-reachable targets.

### Ticket / QR (signature, sacred)
- The ticket is the app's most important surface. High-contrast QR on a light-enough panel to scan reliably at a gate; event name in Display, essential details only. Must render and remain legible **offline / on poor connectivity** — cache it, never gate it behind a spinner. Treat it as the one screen that can never fail.

## 6. Do's and Don'ts

### Do:
- **Do** keep the canvas true black `#000000` — it's premium, OLED-friendly, and the whole point.
- **Do** spend the blue accent sparingly: primary action, live indicator, selection.
- **Do** meet WCAG AA contrast against black for every text and icon; reserve grays for secondary content.
- **Do** design one-handed: large touch targets, thumb-reachable actions, native gestures.
- **Do** lead with imagery (posters, banners) floating on the black.
- **Do** make the ticket/QR resilient — legible offline, cached, instantly scannable; treat it as sacred.

### Don't:
- **Don't** ship a generic college app or a cluttered Eventbrite-style feed.
- **Don't** feel like a ported website — this is native; use native motion and gestures, not web patterns.
- **Don't** overuse blue; if the whole screen glows, nothing does.
- **Don't** rely on low-contrast gray for anything critical.
- **Don't** add a second type family beyond Agrandir (Sweet Apricot stays in the logo).
- **Don't** put the ticket/QR behind a required network call or a spinner it can get stuck on.
