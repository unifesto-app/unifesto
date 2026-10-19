import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GroupSeatStatus, Prisma } from '@prisma/client';
import axios from 'axios';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { PlanConfigService } from '../subscription/plan-config.service';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import { pages } from '../common/batching';
import { fontFilePath, scriptFontFor } from '../certificates/certificate-fonts';
import {
  BRANDING_SPACE_SELECT,
  resolveEventBranding,
} from '../white-label/branding.util';
import {
  RegistrationAttendeesService,
  type RosterFilters,
} from './registration-attendees.service';
import {
  badgeGrid,
  badgesFor,
  type Badge,
  type BadgeLayoutKey,
  type BadgeSeat,
} from './badges.util';

export interface PrintBadgesInput {
  layout: BadgeLayoutKey;
  /** Selected rows; when set the filters still apply on top. */
  registrationIds?: string[];
  filters: Omit<RosterFilters, 'attendingOnly'>;
}

/** An image pdfkit has opened: embedded once, drawn any number of times. */
interface PdfImage {
  width: number;
  height: number;
}
type ImageOpener = { openImage(src: Buffer): PdfImage };

interface BadgeTheme {
  eventTitle: string;
  spaceName: string;
  accent: string;
  logo: PdfImage | null;
  regular: string;
  bold: string;
}

const INK = '#111827';
const MUTED = '#6b7280';
const ACCENT = '#4f46e5';
/** Registrations per DB read; seats + tickets are fetched per page. */
const PAGE = 200;
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Badge / pass printing (N1): a PDF of one badge per attending person, on an
 * A4 sheet with cut marks or one per label. The roster is read a page at a time
 * and pdfkit flushes each finished page, so a 2,000-person event streams out
 * instead of being held in memory (the backend has ~1G; certificate rendering
 * OOM'd it before). QRs are drawn as vector modules, not images.
 */
@Injectable()
export class BadgesService {
  private readonly logger = new Logger(BadgesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planConfig: PlanConfigService,
    private readonly attendees: RegistrationAttendeesService,
  ) {}

  async render(eventId: string, input: PrintBadgesInput) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        title: true,
        slug: true,
        whiteLabelEnabled: true,
        brandColor: true,
        space: { select: { subscription: true, ...BRANDING_SPACE_SELECT } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    // Badges are only for people who count as attending, whatever the filters say.
    const and: Prisma.EventRegistrationWhereInput[] = [
      await this.attendees.rosterWhere(eventId, input.filters),
      COUNTS_AS_ATTENDING,
    ];
    if (input.registrationIds) and.push({ id: { in: input.registrationIds } });
    const where: Prisma.EventRegistrationWhereInput = { AND: and };
    if ((await this.prisma.eventRegistration.count({ where })) === 0) {
      throw new BadRequestException(
        'No confirmed attendees match this selection',
      );
    }

    const has = event.space.subscription
      ? this.planConfig.getEffectiveLimits(event.space.subscription)
          .hasRemoveBranding
      : false;
    const brand = resolveEventBranding(event, event.space, has);
    const doc = new PDFDocument({
      autoFirstPage: false,
      margin: 0,
      info: { Title: `${event.title} badges` },
    });
    const reg = fontFilePath('Poppins', false);
    const bold = fontFilePath('Poppins', true);
    const theme: BadgeTheme = {
      eventTitle: event.title,
      spaceName: brand?.name ?? event.space.name,
      accent: brand?.color || ACCENT,
      logo: brand?.logoUrl ? await this.openLogo(doc, brand.logoUrl) : null,
      regular: reg ?? 'Helvetica',
      bold: bold ?? 'Helvetica-Bold',
    };

    const grid = badgeGrid(input.layout);
    const prisma = this.prisma;
    async function* badgeStream(): AsyncGenerator<Badge> {
      for await (const regs of pages(
        (page) =>
          prisma.eventRegistration.findMany({
            ...page,
            where,
            orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              qrCode: true,
              groupSize: true,
              user: { select: { fullName: true, username: true } },
              ticketType: { select: { name: true } },
              tickets: {
                select: {
                  id: true,
                  qrCode: true,
                  attendeeEmail: true,
                  createdAt: true,
                },
              },
            },
          }),
        PAGE,
      )) {
        const groupIds = regs
          .filter((r) => (r.groupSize ?? 0) > 1)
          .map((r) => r.id);
        const seats = groupIds.length
          ? await prisma.groupSeat.findMany({
              where: {
                registrationId: { in: groupIds },
                status: GroupSeatStatus.CLAIMED,
              },
              select: {
                registrationId: true,
                seatIndex: true,
                status: true,
                claimedAt: true,
                memberDetails: true,
                claimedBy: {
                  select: {
                    fullName: true,
                    username: true,
                    identities: { select: { email: true } },
                  },
                },
              },
            })
          : [];
        const seatsByReg = new Map<string, BadgeSeat[]>();
        for (const s of seats)
          seatsByReg.set(s.registrationId, [
            ...(seatsByReg.get(s.registrationId) ?? []),
            s,
          ]);
        for (const r of regs) yield* badgesFor(r, seatsByReg.get(r.id) ?? []);
      }
    }

    const draw = async () => {
      let i = 0;
      // ponytail: no backpressure on the response; ~2 KB per badge (2,600 measured
      // at 3-5 MB). Await a drain here if events get far bigger.
      for await (const badge of badgeStream()) {
        const slot = i++ % grid.perPage;
        if (slot === 0) doc.addPage({ size: grid.page, margin: 0 });
        const { x, y } = grid.cells[slot];
        this.drawBadge(doc, theme, badge, x, y, grid.badge[0], grid.badge[1]);
        if (grid.cutMarks)
          this.drawCutMarks(doc, x, y, grid.badge[0], grid.badge[1]);
      }
      doc.end();
    };
    // A read failure surfaces as a stream error; the controller cuts the response.
    draw().catch((err) => doc.destroy(err));
    return {
      stream: doc,
      filename: `${event.slug}-badges-${input.layout}.pdf`,
    };
  }

  /** The brand logo as a pdfkit image, opened once and reused on every badge. Optional. */
  private async openLogo(
    doc: PDFKit.PDFDocument,
    url: string,
  ): Promise<PdfImage | null> {
    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        maxContentLength: LOGO_MAX_BYTES,
      });
      // pdfkit reads PNG and JPEG; anything else (SVG, WebP) prints without a logo.
      return (doc as unknown as ImageOpener).openImage(Buffer.from(res.data));
    } catch (error) {
      this.logger.warn(
        `Badge logo skipped (${url}): ${(error as Error).message}`,
      );
      return null;
    }
  }

  private drawBadge(
    doc: PDFKit.PDFDocument,
    t: BadgeTheme,
    b: Badge,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const pad = Math.min(w, h) * 0.06;
    const band = Math.max(18, h * 0.16);

    // Brand band: accent colour, logo and space name.
    doc.save().rect(x, y, w, band).fill(t.accent).restore();
    let bandText = x + pad;
    if (t.logo) {
      const lh = band - pad;
      // pdfkit takes an opened image wherever it takes a source (typings lag).
      doc.image(t.logo as unknown as Buffer, bandText, y + pad / 2, {
        fit: [lh * 3, lh],
      });
      const img = t.logo;
      bandText += Math.min(lh * 3, (lh * img.width) / img.height) + pad / 2;
    }
    doc
      .font(t.bold)
      .fontSize(Math.min(11, band * 0.42))
      .fillColor('#ffffff');
    const bandLine = doc.currentLineHeight(true);
    doc.text(t.spaceName, bandText, y + (band - bandLine) / 2, {
      width: x + w - pad - bandText,
      height: bandLine + 0.5,
      ellipsis: true,
    });

    // Landscape: details left, QR right. Portrait: details on top, QR below.
    const bodyY = y + band + pad;
    const bodyH = h - band - 2 * pad;
    const landscape = w >= h;
    const qr = landscape
      ? Math.min(bodyH, w * 0.42)
      : Math.min(w - 2 * pad, bodyH * 0.55);
    const textW = landscape ? w - 3 * pad - qr : w - 2 * pad;
    const textH = landscape ? bodyH : bodyH - qr - pad;
    this.drawQr(
      doc,
      b.qr,
      landscape ? x + w - pad - qr : x + (w - qr) / 2,
      landscape ? bodyY + (bodyH - qr) / 2 : y + h - pad - qr,
      qr,
    );

    // Name: one line when it fits at 70% of the max size or more, else the
    // largest size (down to 8pt) that fits two lines.
    const nameFont = scriptFontFor(b.name, true)?.path ?? t.bold;
    doc.font(nameFont).fillColor(INK);
    const lines = (n: number) => n * doc.currentLineHeight(true) + 0.5;
    const max = Math.min(24, textH * 0.32);
    const oneLine = Math.min(
      max,
      (max * textW) / doc.fontSize(max).widthOfString(b.name),
    );
    let size = oneLine >= max * 0.7 ? Math.floor(oneLine) : max;
    while (
      size > 8 &&
      doc.fontSize(size).heightOfString(b.name, { width: textW }) > lines(2)
    )
      size -= 1;
    doc.text(b.name, x + pad, bodyY, {
      width: textW,
      height: lines(2),
      ellipsis: true,
    });

    const small = Math.max(7, Math.min(11, textH * 0.075));
    doc.font(t.bold).fontSize(small).fillColor(t.accent);
    doc.text(b.ticketType, x + pad, doc.y + small * 0.3, {
      width: textW,
      height: lines(1),
      ellipsis: true,
    });
    doc
      .font(t.regular)
      .fontSize(small * 0.9)
      .fillColor(MUTED);
    doc.text(t.eventTitle, x + pad, doc.y + small * 0.2, {
      width: textW,
      height: lines(2),
      ellipsis: true,
    });
  }

  /** The QR as filled vector runs: crisp on any printer, no image per badge. */
  private drawQr(
    doc: PDFKit.PDFDocument,
    text: string,
    x: number,
    y: number,
    size: number,
  ) {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = modules.size;
    const m = size / (n + 2); // 1-module quiet zone each side (the badge is white)
    const ox = x + m;
    const oy = y + m;
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!modules.get(r, c)) {
          c++;
          continue;
        }
        const start = c;
        while (c < n && modules.get(r, c)) c++;
        doc.rect(ox + start * m, oy + r * m, (c - start) * m, m);
      }
    }
    doc.fill('#000000');
  }

  /** Corner ticks just outside the badge, in the sheet's gap and margin. */
  private drawCutMarks(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const len = 8;
    const off = 2;
    doc.save().lineWidth(0.4).strokeColor('#9ca3af');
    for (const [cx, cy, dx, dy] of [
      [x, y, -1, -1],
      [x + w, y, 1, -1],
      [x, y + h, -1, 1],
      [x + w, y + h, 1, 1],
    ]) {
      doc
        .moveTo(cx + dx * off, cy)
        .lineTo(cx + dx * (off + len), cy)
        .stroke();
      doc
        .moveTo(cx, cy + dy * off)
        .lineTo(cx, cy + dy * (off + len))
        .stroke();
    }
    doc.restore();
  }
}
