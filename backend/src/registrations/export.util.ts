/**
 * Attendee export helpers — turn a table of rows into a downloadable file in
 * CSV, Excel (SpreadsheetML 2003) or PDF format.
 *
 * Every format is produced as a stream, one page of rows at a time, so a big
 * export is written to the response as it is read instead of being built whole
 * in memory (S54). Authorization and data fetching live in the service;
 * formatting lives here.
 */
import { Readable } from 'stream';
import PDFDocument from 'pdfkit';
import { csvCell, toCsv } from '../common/csv';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

/** CSV as a stream of chunks, one per page of rows. */
export async function* csvChunks(
  header: string[],
  rowPages: AsyncIterable<string[][]>,
): AsyncGenerator<string> {
  // toCsv adds the UTF-8 BOM so Excel opens non-ASCII (₹, accented names) correctly.
  yield toCsv([header]);
  for await (const rows of rowPages) {
    if (rows.length === 0) continue;
    yield '\r\n' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  }
}

/** A whole small CSV (import templates). */
export function csvFile(header: string[], rows: string[][]): Buffer {
  return Buffer.from(toCsv([header, ...rows]), 'utf8');
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
 * A SpreadsheetML 2003 (.xls) workbook. It's a single plain-XML file that
 * Excel and Google Sheets open natively — real columns, no ZIP, no dependency.
 */
export async function* xlsxChunks(
  header: string[],
  rowPages: AsyncIterable<string[][]>,
  sheetName: string,
): AsyncGenerator<string> {
  const cell = (v: string) =>
    `<Cell><Data ss:Type="String">${xmlEscape(v)}</Data></Cell>`;
  const row = (cells: string[]) => `<Row>${cells.map(cell).join('')}</Row>`;

  yield '<?xml version="1.0"?>' +
    '<?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    `<Worksheet ss:Name="${xmlEscape(sheetName.slice(0, 31) || 'Attendees')}">` +
    '<Table>' +
    row(header);
  for await (const rows of rowPages) yield rows.map(row).join('');
  yield '</Table></Worksheet></Workbook>';
}

/** A simple paginated table PDF; pdfkit's document is itself the stream. */
export function pdfStream(
  header: string[],
  rowPages: AsyncIterable<string[][]>,
  title: string,
): Readable {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
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

  const drawPages = async () => {
    for await (const rows of rowPages) {
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
    }
    doc.end();
  };
  // A read failure surfaces as a stream error; the controller cuts the response.
  drawPages().catch((err) => doc.destroy(err));
  return doc;
}
