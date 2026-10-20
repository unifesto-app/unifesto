# W1 screen clips (S rows)

Frame sequences for the `S` rows in `../../01-video-script.md`, captured 19–20 Oct 2026 on prod (space.unifesto.app, demo Space **Aurora Tech Club**, sample data) in the in-app browser. Each folder is one script row; `01.png` is the before state, the last frame is the after state. The video kit composites them inside `panel()` on the cosmos with zooms and a cursor ring.

## Format

- **Desktop**: browser at 1440x900, dark. Each frame is 2x2 zoomed tiles stitched to 1600x1000 (1.11 px per CSS px), then **cropped to `0,74,1600,998` → 1600x924**: the 64 px app header (with the owner's name and, on the live site, the real phone number) is cut off. The sidebar is kept. The phone number was also hidden in the page (CSS) before any capture.
- **request-space** (public www page, no account data): full 1600x1000, not cropped; the site header stays.
- **Phone** (`0506-phone-nav`): 375x812 at 2x → 750x1624 native, not cropped. The mobile header shows no phone number.
- Cursor targets below are in frame pixels (x, y) for the cursor ring.

## Map

| Folder | Script time | Bujji line | Frames | Notes |
|---|---|---|---|---|
| `0046-request-space` | 0:46 | W1-L07 | 01 hero + "Your space", 02 Regular/Super + About you, 03 consent + "Verify and continue" | Scroll stops at 0, 450, 900 px. Not submitted. |
| `0102-space-home-stats` | 1:02 | W1-L08 | 01 Space home | Stat row: **Published 1, In progress 1, People attending 161, All events 4** (prod labels; the script says published, draft, attendees, events). Stat row spans y≈150–330. |
| `0114-space-profile` | 1:14 | W1-L09 | 01 Settings > General, 02 tag "work" typing, 03 "workshops" chip added, 04 removed | Name, slug `aurora-tech-club`, description, tags. Not saved. Tags field ≈ (930, 644). |
| `0130-logo-slot` | 1:30 | W1-L10 | 01 Branding card | Logo slot "No logo yet" ≈ (464, 346); its Upload image ≈ (451, 469). The button has no visible hover state, so point with the cursor ring. |
| `0153-members-roster` | 1:53 | W1-L13 | 01 roster of 6 | "Total members 6" stat top left. |
| `0202-member-search` | 2:02 | W1-L14 | 01 Add member panel, empty, 02 "ananya" with 4 results, 03 field cleared | Results are all seed accounts (@ananya_gupta86, @ananya_gupta26, @ananya_iyer106, @ananya_iyer46). Esc does nothing on prod, so 03 is the cleared field, not an Esc. Field ≈ (930, 460). Nobody added. |
| `0218-role-filter` | 2:18 | W1-L15 | 01 All roles, 02 dropdown open, 03 Space Admin (1 person), 04 back to All roles | Client-side filter only. Filter ≈ (1420, 380). |
| `0234-remove-member` | 2:34 | W1-L16 | 01 roster, 02 hover on Aarav Rao's remove (trash) button, 03 back | On prod "Remove member" is a trash icon that opens a native browser confirm (screenshots can't capture it), not a menu. Not clicked. Trash ≈ (1488, 467). |
| `0340-iam-grid` | 3:40 | W1-L23 | 01 grid, 02 hover ring on Co-Curator × Publish / unpublish | The page saves on click; nothing was toggled. Columns fit one frame, so pan in the kit. Checkbox ≈ (684, 449). |
| `0412-new-event` | 4:12 | W1-L26 | 01 Events list, 02 wizard step 1, 03 "Orien", 04 "Orientation 2026", 05 back on list after Cancel | Wizard only creates on the last step; still 4 events after Cancel. Name field ≈ (930, 326). |
| `0424-setup-checklist` | 4:24 | W1-L27 | 01 Event setup "3 of 4 essentials done." 75% | **Event differs from script**: on prod the 3-of-4 checklist is on **Figma for beginners** (published, 21 Oct). Build Night ended 16 Oct and now shows the end-of-event checklist. Either change the script line or keep the line and show this event. |
| `0436-event-team` | 4:36 | W1-L28 | 01 Team (4): Curator, Co-Curator, 2 Crew, 02 role picker open (Curator / Co-Curator / Crew), 03 closed with Esc | Aurora Fest 2026 (completed). Role picker ≈ (1412, 315). Nobody added. |
| `0506-phone-nav` | 5:06 | W1-L30 | 01 Events on phone, 02 drawer open, 03 Space home after tapping Overview | Native 750x1624. Hamburger ≈ (60, 63), Overview ≈ (175, 468). |
| `0528-transfer-ownership` | 5:28 | W1-L33 | 01 Ownership card, 02 form open, 03 New owner list (Diya Gupta highlighted), 04 Diya Gupta chosen + "Why are you handing it over?", 05 after Cancel | Inline card, not a dialog. "Send for approval" never pressed; no request is pending. New owner select ≈ (534, 647). |

## Not opened

Event Settings > payouts (real UPI ID), any attendee list with emails, and no Save, Submit, Send for approval, Publish or Remove anywhere.

## Other script notes

- The events list also has **Aurora Fest 2027** (draft) next to Aurora Fest 2026 (completed). Event covers are blank placeholders (no 4:3 banners in the seed).
