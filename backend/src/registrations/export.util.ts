/**
 * Attendee export helpers — turn a table of rows into a downloadable file in
 * CSV, Excel (SpreadsheetML 2003) or PDF format.
 *
 * These functions are pure: they take a header row + data rows and return a
 * Buffer plus the matching Content-Type and file extension. Authorization and
 * data fetching live in the service; formatting lives here.
 */
import PDFDocument from 'pdfkit';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ExportFile {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

/** Escape one CSV cell: wrap in quotes when it contains a comma, quote or newline. */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(header: string[], rows: string[][]): Buffer {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  // Prepend a UTF-8 BOM so Excel opens non-ASCII (₹, accented names) correctly.
  return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
}

/** Escape a value for XML text/attribute content. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build a SpreadsheetML 2003 (.xls) workbook. It's a single plain-XML file that
 * Excel and Google Sheets open natively — real columns, no ZIP, no dependency.
 */
function toXlsx(header: string[], rows: string[][], sheetName: string): Buffer {
  const cell = (v: string) =>
    `<Cell><Data ss:Type="String">${xmlEscape(v)}</Data></Cell>`;
  const row = (cells: string[]) => `<Row>${cells.map(cell).join('')}</Row>`;

  const xml =
    '<?xml version="1.0"?>' +
    '<?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    `<Worksheet ss:Name="${xmlEscape(sheetName.slice(0, 31) || 'Attendees')}">` +
    '<Table>' +
    row(header) +
    rows.map(row).join('') +
    '</Table></Worksheet></Workbook>';

  return Buffer.from(xml, 'utf8');
}

/** Render a simple paginated table PDF. Collects the pdfkit stream into a Buffer. */
function toPdf(
  header: string[],
  rows: string[][],
  title: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const usableWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = usableWidth / header.length;
    const rowHeight = 20;

    doc.fontSize(16).text(title, { align: 'left' });
    doc.moveDown(0.5);

    const drawRow = (cells: string[], y: number, bold: boolean) => {
      doc.fontSize(8).font(bold ? 'Helvetica-Bold' : 'Helvetica');
      cells.forEach((text, i) => {
        doc.text(text, left + i * colWidth + 2, y + 5, {
          width: colWidth - 4,
          height: rowHeight,
          ellipsis: true,
          lineBreak: false,
        });
      });
      doc
        .moveTo(left, y + rowHeight)
        .lineTo(left + usableWidth, y + rowHeight)
        .strokeColor('#e5e7eb')
        .stroke();
    };

    let y = doc.y;
    drawRow(header, y, true);
    y += rowHeight;

    for (const dataRow of rows) {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        drawRow(header, y, true);
        y += rowHeight;
      }
      drawRow(dataRow, y, false);
      y += rowHeight;
    }

    doc.end();
  });
}

/** Build an export file in the requested format from a header + rows table. */
export async function buildExportFile(
  format: ExportFormat,
  title: string,
  header: string[],
  rows: string[][],
): Promise<ExportFile> {
  switch (format) {
    case 'xlsx':
      return {
        buffer: toXlsx(header, rows, title),
        contentType: 'application/vnd.ms-excel',
        extension: 'xls',
      };
    case 'pdf':
      return {
        buffer: await toPdf(header, rows, title),
        contentType: 'application/pdf',
        extension: 'pdf',
      };
    case 'csv':
    default:
      return {
        buffer: toCsv(header, rows),
        contentType: 'text/csv; charset=utf-8',
        extension: 'csv',
      };
  }
}
