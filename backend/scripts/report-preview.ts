/* Standalone render check for ReportRenderService — no DB, no Nest container. */
import { writeFileSync } from 'fs';
import { ReportSection } from '@prisma/client';
import { ReportRenderService } from '../src/reports/report-render.service';
import type { ReportData } from '../src/reports/report-data.service';

const data: ReportData = {
  overview: {
    totalRegistrations: 342,
    attending: 318,
    checkedIn: 271,
    waitlisted: 15,
    attendanceRate: 85.2,
    capacityFill: 79.5,
    collected: 512400,
    fees: 25620,
    refunded: 8000,
    net: 478780,
  },
  checkins: { attending: 318, checkedIn: 271, notCheckedIn: 47, rate: 85.2 },
  tickets: [
    { name: 'Early Bird', price: 999, sold: 120, revenue: 119880, remaining: 0 },
    { name: 'Regular', price: 1499, sold: 160, revenue: 239840, remaining: 40 },
    { name: 'VIP', price: 4999, sold: 30, revenue: 149970, remaining: 20 },
    { name: 'Student', price: 0, sold: 8, revenue: 0, remaining: null },
  ],
  revenue: {
    totalRegistrations: 342,
    attending: 318,
    checkedIn: 271,
    waitlisted: 15,
    attendanceRate: 85.2,
    capacityFill: 79.5,
    collected: 512400,
    fees: 25620,
    refunded: 8000,
    net: 478780,
  },
  attendees: Array.from({ length: 40 }, (_, i) => ({
    name: `Attendee ${i + 1}`,
    email: `attendee${i + 1}@example.com`,
    ticket: ['Early Bird', 'Regular', 'VIP', 'Student'][i % 4],
    status: 'CONFIRMED',
    paymentStatus: i % 7 === 0 ? 'PARTIALLY_REFUNDED' : 'PAID',
    checkedIn: i % 3 !== 0,
  })),
};

async function main() {
  const render = new ReportRenderService();
  const pdf = await render.renderPdf({
    event: {
      title: 'Adhvira TechFest 2026',
      status: 'COMPLETED',
      startDateTime: new Date('2026-03-14T09:00:00+05:30'),
      endDateTime: new Date('2026-03-15T18:00:00+05:30'),
      venue: 'Hyderabad International Convention Centre',
      spaceName: 'Adhvira',
    },
    reportTitle: 'Adhvira TechFest 2026 — Full Report',
    sections: [
      ReportSection.OVERVIEW,
      ReportSection.CHECKINS,
      ReportSection.TICKETS,
      ReportSection.REVENUE,
      ReportSection.ATTENDEES,
    ],
    window: { from: null, to: null },
    data,
    generatedAt: new Date(),
  });
  const out = process.argv[2] || '/tmp/report-preview.pdf';
  writeFileSync(out, pdf);
  console.log(`Wrote ${pdf.length} bytes to ${out}`);
}

void main();
