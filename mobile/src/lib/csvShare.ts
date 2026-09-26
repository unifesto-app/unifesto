import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** One CSV cell: always quoted, inner quotes doubled (same rule as the web exports). */
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/**
 * Build a CSV from a header + rows, save it to the cache and open the share
 * sheet (Files, Mail, WhatsApp, Drive…). The phone has no "Downloads" to drop
 * into, so sharing is the export. Returns false if nothing could be shared.
 */
export async function shareCsv(fileName: string, header: string[], rows: unknown[][]): Promise<boolean> {
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  const file = new File(Paths.cache, fileName.endsWith('.csv') ? fileName : `${fileName}.csv`);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
  return true;
}

/** Safe file-name part from free text ("Acme Corp!" → "acme-corp"). */
export const slugPart = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'export';
