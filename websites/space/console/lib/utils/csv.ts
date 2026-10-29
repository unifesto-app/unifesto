/**
 * One CSV cell, same rule as the backend's `common/csv.ts`: quoted when needed,
 * and a leading = + - @ (or tab/CR) gets a ' so a spreadsheet never runs
 * user-typed text as a formula. Numbers and phone-style values are left alone.
 */
function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Download rows as a CSV (CRLF, with a BOM so Excel reads names in any script). */
export function downloadCsv(filename: string, header: string[], rows: unknown[][]) {
  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}
