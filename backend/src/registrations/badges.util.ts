import { GroupSeatStatus } from '@prisma/client';
import { memberSeatTicket, type SeatHolder } from './registration.util';

/**
 * Badge / pass printing (N1): page layouts and who gets a badge. Pure, so the
 * layout math and roster rules are unit-tested without pdfkit or a database.
 */

/** Sizes in mm. A sheet tiles badges with cut marks; a label is one badge per page. */
interface LayoutDef {
  label: string;
  page: [number, number];
  badge: [number, number];
  /** Sheet only: blank border and spacing between badges. */
  margin?: number;
  gap?: number;
}

export const BADGE_LAYOUTS = {
  'a4-8': {
    label: 'A4 sheet, 8 per page (90 × 60 mm)',
    page: [210, 297],
    badge: [90, 60],
    margin: 10,
    gap: 6,
  },
  // 4 × 3 in direct-thermal badge labels (Zebra, Brother TD, DYMO XL).
  'label-4x3in': {
    label: '4 × 3 in label',
    page: [101.6, 76.2],
    badge: [101.6, 76.2],
  },
  // Brother QL with a 62 mm roll / DK-11202 die-cut labels.
  'label-62x100mm': {
    label: '62 × 100 mm label (Brother QL)',
    page: [62, 100],
    badge: [62, 100],
  },
  // DYMO LabelWriter 30857 name badge, 2¼ × 4 in.
  'label-dymo-30857': {
    label: '2¼ × 4 in name badge (DYMO 30857)',
    page: [101.6, 57.2],
    badge: [101.6, 57.2],
  },
} satisfies Record<string, LayoutDef>;

export type BadgeLayoutKey = keyof typeof BADGE_LAYOUTS;
export const BADGE_LAYOUT_KEYS = Object.keys(BADGE_LAYOUTS) as BadgeLayoutKey[];

export const mmToPt = (mm: number) => (mm * 72) / 25.4;

export interface BadgeGrid {
  /** Page and badge size in PDF points. */
  page: [number, number];
  badge: [number, number];
  cols: number;
  rows: number;
  perPage: number;
  /** Top-left corner of each badge on a page, row by row, in points. */
  cells: { x: number; y: number }[];
  /** Sheets get cut marks; a label page is already the badge. */
  cutMarks: boolean;
}

/** How a layout tiles its page: as many badges as fit inside the margin, centred. */
export function badgeGrid(key: BadgeLayoutKey): BadgeGrid {
  const def: LayoutDef = BADGE_LAYOUTS[key];
  const [pw, ph] = def.page;
  const [bw, bh] = def.badge;
  const margin = def.margin ?? 0;
  const gap = def.gap ?? 0;
  const fit = (space: number, size: number) =>
    Math.max(1, Math.floor((space - 2 * margin + gap) / (size + gap)));
  const cols = fit(pw, bw);
  const rows = fit(ph, bh);
  // Centre the block so the cut marks sit evenly inside the printable area.
  const x0 = (pw - (cols * bw + (cols - 1) * gap)) / 2;
  const y0 = (ph - (rows * bh + (rows - 1) * gap)) / 2;
  const cells: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x: mmToPt(x0 + c * (bw + gap)),
        y: mmToPt(y0 + r * (bh + gap)),
      });
    }
  }
  return {
    page: [mmToPt(pw), mmToPt(ph)],
    badge: [mmToPt(bw), mmToPt(bh)],
    cols,
    rows,
    perPage: cols * rows,
    cells,
    cutMarks: cols * rows > 1,
  };
}

export const pageCount = (badges: number, key: BadgeLayoutKey) =>
  Math.ceil(badges / badgeGrid(key).perPage);

/** One printed badge. `qr` is the exact string the check-in scanner looks up. */
export interface Badge {
  name: string;
  ticketType: string;
  qr: string;
}

export interface BadgeRegistration {
  qrCode: string;
  groupSize: number | null;
  user: { fullName: string | null; username: string | null };
  ticketType: { name: string } | null;
  tickets: {
    id: string;
    qrCode: string;
    attendeeEmail: string | null;
    createdAt: Date;
  }[];
}

export type BadgeSeat = SeatHolder & {
  status: GroupSeatStatus;
  claimedBy?:
    | (SeatHolder['claimedBy'] & {
        fullName: string | null;
        username: string | null;
      })
    | null;
};

const NAME_KEYS = ['name', 'full name', 'fullname', 'attendee name'];

/** The typed-in name on a seat, tolerant of `{ name }` and `{ customFields: { Name } }` shapes. */
function detailsName(md: unknown): string | null {
  if (!md || typeof md !== 'object') return null;
  const { customFields, ...rest } = md as Record<string, unknown>;
  const flat = {
    ...rest,
    ...(customFields && typeof customFields === 'object' ? customFields : {}),
  };
  for (const [k, v] of Object.entries(flat)) {
    if (
      NAME_KEYS.includes(k.toLowerCase()) &&
      typeof v === 'string' &&
      v.trim()
    )
      return v.trim();
  }
  return null;
}

/**
 * The badges for one attending registration. An individual booking is one
 * badge on the registration QR. A group is one badge per CLAIMED seat:
 * the lead on the group QR (their pass), each member on their own seat ticket
 * so a scan checks in only them. Unclaimed seats have nobody to badge and
 * can't be checked in, so they are skipped. A member with no seat ticket
 * (typed in without an email) falls back to the group QR, as on their mail.
 */
export function badgesFor(reg: BadgeRegistration, seats: BadgeSeat[]): Badge[] {
  const ticketType = reg.ticketType?.name || 'RSVP';
  const holder = reg.user.fullName || reg.user.username || 'Guest';
  if ((reg.groupSize ?? 0) <= 1 || seats.length === 0) {
    return [{ name: holder, ticketType, qr: reg.qrCode }];
  }
  return seats
    .filter((s) => s.status === GroupSeatStatus.CLAIMED)
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((s) => ({
      name:
        detailsName(s.memberDetails) ||
        s.claimedBy?.fullName ||
        s.claimedBy?.username ||
        (s.seatIndex === 1 ? holder : 'Guest'),
      ticketType,
      qr: memberSeatTicket(s, reg.tickets)?.qrCode ?? reg.qrCode,
    }));
}
