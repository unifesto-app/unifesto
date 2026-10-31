---
name: Unifesto Horizon (Mobile)
description: The Unifesto app in the Horizon theme. Night first, thin lines, monochrome chrome, and colour only inside cards, on the work it describes.
theme: Unifesto Horizon, locked 29 Oct 2026. Spec marketing/brand-2026/guidelines.html; tokens src/theme/cosmos.ts.
colors:
  night: "#000000"
  card: "#141416"
  type: "#ececee"
  silver: "#e8e8ea"
  soft: "#b4b4ba"
  muted: "#8a8a90"
  paper: "#f2f2f5"
  white-card: "#ffffff"
  ink: "#111113"
  mint: "#90e4c1 night / #15745a day"
  sky: "#90d5ff night / #0369a1 day"
  ivory: "#f7f0e0 night / #7a5a1e day"
  horizon-blue: "#4d8dff night / #8fb4ff day (light only, never text)"
  crimson: "#ec2f58 night / #be123c day"
  amber: "#f59e0b night / #92400e day"
typography:
  display: "DMSans-Medium 500, cosmosFont.display, displayTracking(size)"
  text: "HankenGrotesk 400 / SemiBold 600, cosmosFont.body / cosmosFont.strong"
  figure: "DMSans-SemiBold, cosmosFont.figure (Hanken has no ₹)"
rounded:
  control: "14 (cosmosRadius): buttons, fields, segments"
  card: "20 (cosmosCardRadius): cards, covers, shade cards"
  inner: "12 (borderRadius.md): thumbnails, logos inside a card"
---

# Unifesto Horizon, mobile

The app wears the same theme as unifesto.app, the console and Apex. This file is the rulebook for
every screen and component in `mobile/`. The theme is locked: layout and content changes reuse the
tokens and components named here. A new colour, shape, light effect, font or icon needs the
owner's approval first.

## 1. The six rules

1. **Night first.** Black ground, silver type. By day the same roles sit on paper `#f2f2f5` with
   white cards, and light turns pale blue. Day is translated, not inverted.
2. **Thin lines only.** The sky is starlight, two white orbit hairlines, the horizon line and a soft
   Horizon-blue glow. Never planets, bars, glows on buttons or coloured lines.
3. **Colour lives in cards.** Mint, sky and ivory sit inside cards, on the work they describe:
   text, figures, progress fills, dots and glyphs. Navigation, links, buttons, borders and the
   page stay monochrome.
4. **Colour blends.** Where a card carries its accent as a shape (a shade card), the shapes melt
   into a deep base. No hard edges, no outlines.
5. **Grain on everything.** The sky carries film grain (12% night, 9% day); shade cards carry more.
6. **Statuses are plain text.** Never pills or tinted chips: "✓ Checked in", "Sold out",
   "Hackathon · Hyderabad".

## 2. Ground

- Every screen sits on `CosmosScreen` / `CosmosList` or draws `<CosmosBackdrop horizon={false} />`
  itself. Never a custom page background, gradient or image behind a whole screen.
- `CosmosBackdrop` (default `horizon`) is the hero sky: login, splash, auth callback. Scrolling
  screens use `horizon={false}`: stars, orbits and grain only. Banner-lit pages pass `hue`.

## 3. Colour

Read colours from `useCosmos()` (`c`). No hex literals in screens or components.

| Token | Use |
|---|---|
| `c.bg` | the page (the backdrop paints it) |
| `c.raised` / `CardBackdrop` | borderless cards |
| `c.text` | titles, values, primary glyphs |
| `c.soft` | secondary lines inside cards |
| `c.muted` | labels, meta, captions, chevrons, tags |
| `c.primary` / `c.primaryFg` | the primary button (silver on night, ink on day) |
| `c.border` | hairline dividers inside cards (`StyleSheet.hairlineWidth`) |
| `c.tint` | pressed rows, progress tracks |
| `c.mint` | **live and check-in**: checked-in counts, live dots, scan success, "Live now" |
| `c.sky` | **tickets and events**: ticket tiers, seats left, registrations, pass details |
| `c.ivory` | **money**: collected, revenue, payouts, refunds, earnings, wallet |
| `c.success` | done states (Paid, Sent, Reviewed): mint |
| `c.warn` | amber: needs attention, almost full, pending |
| `c.danger` | crimson: errors, destructive actions, failed |

- One accent per card, picked by the card's job. A ticket card is sky even when it shows a price.
- Accents never colour a card's border, a button, a link, a tab, a header or a whole row.
- `c.horizon` is light, not ink: only the sky and shade cards use it.

## 4. Type

- `cosmosFont.display` (DM Sans 500) **only** for: the screen's own title when the screen draws one,
  the Home headline, hero titles (event, space, session names at the top of their page), section
  titles of 20pt and up, and empty-state headlines. Add `letterSpacing: displayTracking(size)` from
  24pt up.
- `cosmosFont.strong` (Hanken SemiBold) for names, card titles, row labels, statuses, buttons and
  anything under 17pt. People's names and avatar initials are never display.
- `cosmosFont.body` for reading text and meta. `cosmosFont.figure` for counts, prices, dates, codes.
- Sentence case everywhere. No caps labels, no wide letter-spaced eyebrows. Only initials and AM/PM
  stay in capitals.
- Sizes come from `typography.fontSize`; hero figures may go to 32–40.

## 5. Surfaces

- **Cards are borderless.** `CardBackdrop` (first child, no own background) or `c.raised`. Radius
  `cosmosCardRadius` (20). No outline borders, no shadows.
- **Space instead of boxes inside a card.** Rows, stats and notes inside a card sit on the card,
  divided by a hairline (`c.border`) or 12–16pt of space. No tinted tiles, boxes or cards nested in
  a card. Kept as boxes because they are controls: fields, option cards, segmented controls.
- **Grouped lists** use `SettingsGroup` / `SettingsRow` / `GroupCell`. Section titles are muted
  Hanken SemiBold, sentence case.
- **Stats** are a figure over a muted label. `ManageStats` draws a row of them as one card divided
  by hairlines.
- **Shade cards** (`components/ui/ShadeCard`): the hero card of a screen, at most one per screen,
  in its job's tone: `sky` a ticket or pass, `mint` check-in and the door, `ivory` money, `blue`
  hackathons and the Space. The key figure sits on it large, in the accent. Content sits straight
  on the shade; no glass inside.
- **Glass** only on floating chrome (header buttons, segmented tabs over content, sheets, alerts,
  notices, bottom bars, camera overlays). Frosted and untinted. Never on content cards or fields.

## 6. Components

- **Buttons:** `Button`. Primary (silver / ink fill) is the one main action on a screen; secondary is
  a hairline outline; ghost is plain text. Radius 14. Never an accent colour.
- **Statuses:** `Badge` writes a status as text (done states get a tick). Inline statuses follow
  the same look: coloured or muted text, an optional 6pt dot or tick glyph before it.
- **Icons:** Unicon, bare. No circles, tiles or borders behind glyphs; size the glyph up instead.
  Glyphs take `c.text`, `c.muted` or the card's accent.
- **Fields:** `FieldRow` / `AuthField`, solid, radius 14, label above.
- **Alerts:** `AppAlert`, never `Alert.alert`.
- **Images:** banners 4:3, logos 1:1, never cropped off-ratio. No chips or tags over event covers.
- **Empty states:** one display headline (20–24pt), one muted line, at most one button.

## 7. Spacing and radius

- Screen gutter `GUTTER` (`spacing[6]`, from components/home/Section). `spacing[4]` between cards, `spacing[8]` before a new section.
- Inside a card: padding `spacing[4]`–`spacing[5]`, `spacing[3]` between lines of a group.
- Radius: cards 20, controls 14, inner images 12, circles stay round. Never square corners.

## 8. The ticket

The pass is the app's most important surface: legible at a gate, offline, in a hurry. The QR sits on
a plain white panel with its quiet zone, never under grain, tint or glass. Event name, holder, tier
and gate details only.

## 9. Copy

Organiser-first and plain. First person for the user's own things ("My tickets"). No em dashes in
UI copy. Errors say what happened and what to do.
