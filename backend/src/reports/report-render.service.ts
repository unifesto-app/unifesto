import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ReportSection } from '@prisma/client';
import { fontFilePath } from '../certificates/certificate-fonts';
import type {
  AttendeeRow,
  ReportData,
  ReportOverview,
  TicketRow,
} from './report-data.service';

/** Event context stamped onto the report's cover header. */
export interface ReportEventHeader {
  title: string;
  status: string;
  startDateTime: Date;
  endDateTime: Date;
  venue: string | null;
  spaceName: string;
}

export interface ReportRenderInput {
  event: ReportEventHeader;
  reportTitle: string;
  sections: ReportSection[];
  window: { from: Date | null; to: Date | null };
  data: ReportData;
  generatedAt: Date;
}

// A restrained, print-friendly palette — dark ink on white, one accent.
const INK = '#111827';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';
const ACCENT = '#4f46e5';

const RUPEE = '₹';

/**
 * Composes the formatted event-report PDF with pdfkit: a cover header, a KPI
 * grid, then one block per requested section (in canonical order). Rendering is
 * purely a function of the pre-computed {@link ReportData} — no DB access here —
 * so a report always reflects the snapshot it was generated from.
 */
@Injectable()
export class ReportRenderService {
  /**
   * The regular/bold font names for the current render. Set at the top of
   * renderPdf and read by the draw helpers. Safe as instance state because a
   * single renderPdf draws its whole document synchronously (no awaits between
   * draw calls), so two concurrent renders never interleave their drawing.
   */
  private f = { regular: 'Helvetica', bold: 'Helvetica-Bold' };

  renderPdf(input: ReportRenderInput): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // bufferPages so the footer pass can revisit every page for "page x of y".
      const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Use a bundled TTF (Poppins) — the built-in Helvetica (WinAnsi) has no
      // ₹ glyph and renders it as a stray character. Fall back to Helvetica if
      // the font file isn't present in this deployment.
      const reg = fontFilePath('Poppins', false);
      const bold = fontFilePath('Poppins', true);
      if (reg && bold) {
        doc.registerFont('ReportSans', reg);
        doc.registerFont('ReportSans-Bold', bold);
        this.f = { regular: 'ReportSans', bold: 'ReportSans-Bold' };
      } else {
        this.f = { regular: 'Helvetica', bold: 'Helvetica-Bold' };
      }

      this.drawHeader(doc, input);

      // Canonical section order, regardless of the order sections were chosen.
      const order: ReportSection[] = [
        ReportSection.OVERVIEW,
        ReportSection.CHECKINS,
        ReportSection.TICKETS,
        ReportSection.REVENUE,
        ReportSection.ATTENDEES,
      ];
      const wanted = new Set(input.sections);

      for (const section of order) {
        if (!wanted.has(section)) continue;
        switch (section) {
          case ReportSection.OVERVIEW:
            if (input.data.overview) this.drawOverview(doc, input.data.overview);
            break;
          case ReportSection.CHECKINS:
            if (input.data.checkins) this.drawCheckins(doc, input.data.checkins);
            break;
          case ReportSection.TICKETS:
            if (input.data.tickets) this.drawTickets(doc, input.data.tickets);
            break;
          case ReportSection.REVENUE:
            if (input.data.revenue) this.drawRevenue(doc, input.data.revenue);
            break;
          case ReportSection.ATTENDEES:
            if (input.data.attendees)
              this.drawAttendees(doc, input.data.attendees);
            break;
        }
      }

      this.drawFooter(doc);
      doc.end();
    });
  }

  // ---------------------------------------------------------------------------
  // Header / footer
  // ---------------------------------------------------------------------------

  private drawHeader(doc: PDFKit.PDFDocument, input: ReportRenderInput) {
    const { event } = input;
    doc
      .fillColor(ACCENT)
      .fontSize(9)
      .font(this.f.bold)
      .text(event.spaceName.toUpperCase(), { characterSpacing: 1 });

    doc
      .moveDown(0.3)
      .fillColor(INK)
      .fontSize(22)
      .font(this.f.bold)
      .text(input.reportTitle);

    doc
      .moveDown(0.2)
      .fillColor(MUTED)
      .fontSize(11)
      .font(this.f.regular)
      .text(event.title);

    const dates =
      `${fmtDate(event.startDateTime)} – ${fmtDate(event.endDateTime)}` +
      (event.venue ? `  ·  ${event.venue}` : '');
    doc.fontSize(9).text(dates);
    if (input.window.from || input.window.to) {
      doc.text(
        `Reporting window: ${input.window.from ? fmtDate(input.window.from) : 'start'} – ${input.window.to ? fmtDate(input.window.to) : 'now'}`,
      );
    }
    doc.text(`Generated ${fmtDateTime(input.generatedAt)} · Status ${event.status}`);

    doc.moveDown(0.6);
    hr(doc);
    doc.moveDown(0.6);
  }

  private drawFooter(doc: PDFKit.PDFDocument) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Writing inside the bottom margin makes pdfkit spawn a fresh page unless
      // we temporarily drop that page's bottom margin to zero.
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .fillColor(MUTED)
        .fontSize(8)
        .font(this.f.regular)
        .text(
          `Unifesto · page ${i - range.start + 1} of ${range.count}`,
          doc.page.margins.left,
          doc.page.height - 34,
          {
            width:
              doc.page.width - doc.page.margins.left - doc.page.margins.right,
            align: 'center',
            lineBreak: false,
          },
        );
      doc.page.margins.bottom = bottom;
    }
  }

  // ---------------------------------------------------------------------------
  // Sections
  // ---------------------------------------------------------------------------

  private drawOverview(doc: PDFKit.PDFDocument, o: ReportOverview) {
    this.sectionTitle(doc, 'Overview');
    this.kpiGrid(doc, [
      ['Registrations', String(o.totalRegistrations)],
      ['Attending', String(o.attending)],
      ['Checked in', String(o.checkedIn)],
      ['On waiting list', String(o.waitlisted)],
      ['Attendance rate', pct(o.attendanceRate)],
      ['Capacity filled', pct(o.capacityFill)],
      ['Net revenue', money(o.net)],
      ['Collected', money(o.collected)],
    ]);
    doc.moveDown(1);
  }

  private drawCheckins(doc: PDFKit.PDFDocument, c: ReportData['checkins']) {
    if (!c) return;
    this.sectionTitle(doc, 'Check-ins');
    this.kpiGrid(doc, [
      ['Attending', String(c.attending)],
      ['Checked in', String(c.checkedIn)],
      ['Not checked in', String(c.notCheckedIn)],
      ['Attendance rate', pct(c.rate)],
    ]);
    doc.moveDown(1);
  }

  private drawTickets(doc: PDFKit.PDFDocument, tickets: TicketRow[]) {
    this.sectionTitle(doc, 'Tickets');
    this.table(
      doc,
      ['Ticket', 'Price', 'Sold', 'Revenue', 'Remaining'],
      [0.36, 0.15, 0.13, 0.19, 0.17],
      tickets.map((t) => [
        t.name,
        money(t.price),
        String(t.sold),
        money(t.revenue),
        t.remaining == null ? '∞' : String(t.remaining),
      ]),
    );
    doc.moveDown(1);
  }

  private drawRevenue(doc: PDFKit.PDFDocument, r: ReportOverview) {
    this.sectionTitle(doc, 'Revenue');
    this.table(
      doc,
      ['Line', 'Amount'],
      [0.7, 0.3],
      [
        ['Collected (gross)', money(r.collected)],
        ['Processing fees', `- ${money(r.fees)}`],
        ['Refunded', `- ${money(r.refunded)}`],
        ['Net (take-home)', money(r.net)],
      ],
    );
    doc.moveDown(1);
  }

  private drawAttendees(doc: PDFKit.PDFDocument, rows: AttendeeRow[]) {
    this.sectionTitle(doc, `Attendees (${rows.length})`);
    if (rows.length === 0) {
      doc
        .fillColor(MUTED)
        .fontSize(10)
        .font(this.f.regular)
        .text('No attendees in this window.');
      doc.moveDown(1);
      return;
    }
    this.table(
      doc,
      ['Name', 'Email', 'Ticket', 'Payment', 'Checked in'],
      [0.24, 0.32, 0.18, 0.14, 0.12],
      rows.map((a) => [
        a.name,
        a.email,
        a.ticket,
        a.paymentStatus,
        a.checkedIn ? 'Yes' : 'No',
      ]),
    );
    doc.moveDown(1);
  }

  // ---------------------------------------------------------------------------
  // Primitives
  // ---------------------------------------------------------------------------

  private sectionTitle(doc: PDFKit.PDFDocument, title: string) {
    this.ensureSpace(doc, 60);
    doc.x = doc.page.margins.left; // reset after a table/grid left x elsewhere
    doc
      .fillColor(INK)
      .fontSize(14)
      .font(this.f.bold)
      .text(title);
    doc.moveDown(0.4);
  }

  /** A grid of label/value stat cards, 4 per row. */
  private kpiGrid(doc: PDFKit.PDFDocument, cells: [string, string][]) {
    const left = doc.page.margins.left;
    const usable =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const perRow = 4;
    const gap = 10;
    const cardW = (usable - gap * (perRow - 1)) / perRow;
    const cardH = 46;
    const rows = Math.ceil(cells.length / perRow);

    for (let row = 0; row < rows; row++) {
      this.ensureSpace(doc, cardH + 8);
      // One baseline for the whole row — text draws below advance doc.y, so we
      // capture y once here and never re-read it mid-row.
      const y = doc.y;
      for (let col = 0; col < perRow; col++) {
        const cell = cells[row * perRow + col];
        if (!cell) break;
        const x = left + col * (cardW + gap);
        doc
          .roundedRect(x, y, cardW, cardH, 6)
          .fillColor('#f9fafb')
          .fill()
          .strokeColor(LINE)
          .lineWidth(0.5)
          .roundedRect(x, y, cardW, cardH, 6)
          .stroke();
        doc
          .fillColor(MUTED)
          .fontSize(7.5)
          .font(this.f.regular)
          .text(cell[0].toUpperCase(), x + 8, y + 9, {
            width: cardW - 16,
            characterSpacing: 0.4,
            lineBreak: false,
          });
        doc
          .fillColor(INK)
          .fontSize(15)
          .font(this.f.bold)
          .text(cell[1], x + 8, y + 22, { width: cardW - 16, lineBreak: false });
      }
      doc.x = left;
      doc.y = y + cardH + 8;
    }
  }

  /** A simple bordered table with proportional column widths and pagination. */
  private table(
    doc: PDFKit.PDFDocument,
    header: string[],
    widths: number[],
    rows: string[][],
  ) {
    const left = doc.page.margins.left;
    const usable =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const cols = widths.map((w) => w * usable);
    const rowH = 20;

    const drawRow = (cells: string[], bold: boolean) => {
      const y = doc.y;
      if (bold) {
        doc.rect(left, y, usable, rowH).fillColor('#f3f4f6').fill();
      }
      let x = left;
      doc
        .fillColor(bold ? INK : '#374151')
        .fontSize(8.5)
        .font(bold ? this.f.bold : this.f.regular);
      cells.forEach((text, i) => {
        doc.text(text, x + 4, y + 6, {
          width: cols[i] - 8,
          height: rowH,
          ellipsis: true,
          lineBreak: false,
        });
        x += cols[i];
      });
      doc
        .moveTo(left, y + rowH)
        .lineTo(left + usable, y + rowH)
        .strokeColor(LINE)
        .lineWidth(0.5)
        .stroke();
      doc.y = y + rowH;
    };

    this.ensureSpace(doc, rowH * 2);
    drawRow(header, true);
    for (const row of rows) {
      if (this.ensureSpace(doc, rowH)) drawRow(header, true); // repeat header
      drawRow(row, false);
    }
    doc.x = left; // drawRow left x at the last column — reset for flowing text
  }

  /**
   * Ensure `needed` vertical px remain on the page; add a page if not. Returns
   * true when a new page was started (so a table can re-draw its header).
   */
  private ensureSpace(doc: PDFKit.PDFDocument, needed: number): boolean {
    const bottom = doc.page.height - doc.page.margins.bottom - 24;
    if (doc.y + needed <= bottom) return false;
    doc.addPage();
    return true;
  }
}

// -----------------------------------------------------------------------------
// Formatting helpers
// -----------------------------------------------------------------------------

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function money(n: number): string {
  return `${RUPEE}${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function pct(n: number | null): string {
  return n == null ? '—' : `${n}%`;
}

function hr(doc: PDFKit.PDFDocument) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .strokeColor(LINE)
    .lineWidth(1)
    .stroke();
}
