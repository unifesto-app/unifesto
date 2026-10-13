/**
 * One CSV cell. Quoted when needed; a leading = + - @ (or tab/CR) is prefixed
 * with ' so a spreadsheet never runs user-typed text as a formula. Plain
 * numbers and phone-style values (+91 98765-43210) are left alone.
 */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A CSV document (CRLF, with a BOM so Excel reads names in any script). */
export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
