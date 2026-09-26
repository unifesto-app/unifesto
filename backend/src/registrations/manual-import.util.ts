/**
 * Bulk attendee import helpers — parse an uploaded CSV and shape each row into a
 * registration, and build the per-ticket-type template that produced it.
 *
 * These functions are pure (no DB, no Nest): the service supplies the ticket
 * type's kind/group bounds and its custom form fields; this module decides the
 * columns and reads them back. Keeping the column contract in one place means
 * the template a user downloads and the parser that ingests their fill-in can
 * never drift apart.
 */

export type ImportTicketKind = 'RSVP' | 'INDIVIDUAL' | 'GROUP';

/** One custom form field, reduced to what the template needs. */
export interface ImportFormField {
  id: string;
  label: string;
  required: boolean;
  /** Group tickets only: asked once for the team (true) vs every member (false). */
  perGroup: boolean;
}

/** The shape of the ticket type an import targets. */
export interface ImportTicketShape {
  kind: ImportTicketKind;
  minGroupSize: number | null;
  maxGroupSize: number | null;
  formFields: ImportFormField[];
}

/** Fixed leading columns every template carries. */
const COL_NAME = 'Name';
const COL_EMAIL = 'Email';
const COL_MOBILE = 'Mobile';
const COL_GROUP_SIZE = 'Group Size';

/**
 * How many EXTRA member columns a GROUP template exposes beyond the lead (who is
 * the row's own Name/Email/Mobile). Bounded by maxGroupSize so the template stays
 * finite; falls back to minGroupSize, then a small default, when unbounded.
 */
function extraMemberSlots(shape: ImportTicketShape): number {
  if (shape.kind !== 'GROUP') return 0;
  const cap = shape.maxGroupSize ?? shape.minGroupSize ?? 5;
  // -1 because member 1 is the lead captured by the base Name/Email columns.
  return Math.max(0, cap - 1);
}

/** Header labels for the Nth additional member (N is 2-based: "Member 2 ..."). */
function memberHeaders(n: number): { name: string; email: string; mobile: string } {
  return {
    name: `Member ${n} Name`,
    email: `Member ${n} Email`,
    mobile: `Member ${n} Mobile`,
  };
}

export interface TemplateSpec {
  /** The header row, in order. */
  header: string[];
  /** A single illustrative example row (same width as header). */
  sample: string[];
}

/** The header label for a custom form field (a `*` suffix marks it required). */
function fieldColLabel(f: ImportFormField): string {
  return f.label + (f.required ? ' *' : '');
}

/**
 * Split a ticket's form fields into the per-member set (asked of everyone) and
 * the per-group set (asked once for the team). `perGroup` only applies to group
 * tickets; an individual/RSVP ticket has a single attendee, so every field is
 * per-member there regardless of the flag.
 */
function splitFields(shape: ImportTicketShape): {
  perMember: ImportFormField[];
  perGroup: ImportFormField[];
} {
  if (shape.kind !== 'GROUP') {
    return { perMember: shape.formFields, perGroup: [] };
  }
  return {
    perMember: shape.formFields.filter((f) => !f.perGroup),
    perGroup: shape.formFields.filter((f) => f.perGroup),
  };
}

/**
 * Build the ordered header + one example row for a ticket type's template.
 *
 * Per-member fields are asked of the lead and every member (`Member 2 <field>`,
 * …); per-group fields (group tickets only) appear once, next to Group Size, as
 * team-wide columns. Individual/RSVP tickets have one attendee, so all their
 * fields sit after Mobile.
 */
export function buildTemplateSpec(shape: ImportTicketShape): TemplateSpec {
  const header: string[] = [];
  const sample: string[] = [];
  const { perMember, perGroup } = splitFields(shape);

  // Lead (member 1): name/email/mobile + that person's per-member custom fields.
  header.push(COL_NAME, COL_EMAIL, COL_MOBILE);
  sample.push('Asha Rao', 'asha@example.com', '9876543210');
  for (const f of perMember) {
    header.push(fieldColLabel(f));
    sample.push('');
  }

  if (shape.kind === 'GROUP') {
    header.push(COL_GROUP_SIZE);
    sample.push(String(shape.minGroupSize ?? 2));
    // Team-wide questions: asked once for the whole group.
    for (const f of perGroup) {
      header.push(fieldColLabel(f));
      sample.push('');
    }
    const slots = extraMemberSlots(shape);
    for (let i = 0; i < slots; i++) {
      const n = i + 2; // member 2, 3, ...
      const h = memberHeaders(n);
      header.push(h.name, h.email, h.mobile);
      // Only illustrate the first extra member so the row isn't a wall of text.
      if (i === 0) {
        sample.push('Ravi Kumar', 'ravi@example.com', '9876500000');
      } else {
        sample.push('', '', '');
      }
      // Each member answers the per-member custom fields for themselves.
      for (const f of perMember) {
        header.push(`Member ${n} ${fieldColLabel(f)}`);
        sample.push('');
      }
    }
  }

  return { header, sample };
}

/** One captured member of a group (lead included). */
export interface ImportedMember {
  name: string;
  email: string | null;
  mobile: string | null;
  /** This member's own custom-field answers, keyed by field id. */
  customFields?: Record<string, unknown>;
}

/** A single parsed CSV data row, validated and shaped for registration. */
export interface ParsedImportRow {
  /** 1-based line number in the file (header is line 1), for error reporting. */
  line: number;
  name: string;
  email: string;
  mobile: string | null;
  groupSize: number | null;
  /** Lead + members for a GROUP row; null for individual/RSVP. */
  groupMembers: ImportedMember[] | null;
  formResponses: Record<string, unknown>;
  /** Set when the row is unusable; the service reports it as `errored`. */
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalise a header cell for case/space-insensitive matching. */
function normHeader(h: string): string {
  return h.trim().replace(/\s*\*\s*$/, '').toLowerCase();
}

/**
 * Parse RFC-4180 CSV text into a matrix of string cells. Handles quoted fields
 * (with embedded commas, quotes and newlines), CRLF or LF line endings, and a
 * leading UTF-8 BOM. Trailing empty lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM if present (Excel writes one).
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r') {
      // swallow; the \n (or EOF) closes the row
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  // Flush the final cell/row if the file didn't end with a newline.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Drop rows that are entirely empty (blank lines).
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

/**
 * Turn parsed CSV cells into validated import rows for one ticket type.
 * Column lookup is by header NAME (case-insensitive, `*` suffix ignored), so a
 * reordered or partially-filled template still maps correctly. The header row is
 * required and its columns are matched against the spec built from the same
 * ticket shape.
 */
export function parseImportRows(
  shape: ImportTicketShape,
  matrix: string[][],
): { rows: ParsedImportRow[]; fileError?: string } {
  if (matrix.length === 0) return { rows: [], fileError: 'The file is empty.' };

  const header = matrix[0].map(normHeader);
  const col = (label: string): number => header.indexOf(normHeader(label));
  const at = (cells: string[], idx: number): string =>
    idx >= 0 && idx < cells.length ? cells[idx].trim() : '';

  const nameCol = col(COL_NAME);
  const emailCol = col(COL_EMAIL);
  if (nameCol < 0 || emailCol < 0) {
    return {
      rows: [],
      fileError:
        'The file is missing the required "Name" and "Email" columns. Download the template and use its headers.',
    };
  }
  const mobileCol = col(COL_MOBILE);
  const groupSizeCol = col(COL_GROUP_SIZE);
  const slots = extraMemberSlots(shape);
  const { perMember, perGroup } = splitFields(shape);
  const MOBILE_RE = /^[0-9]{10}$/;

  const rows: ParsedImportRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r];
    const line = r + 1; // 1-based, header is line 1
    const name = at(cells, nameCol);
    const email = at(cells, emailCol).toLowerCase();
    const mobile = mobileCol >= 0 ? at(cells, mobileCol) || null : null;

    // Read a set of custom-field answers. `prefix` is '' for the lead / team and
    // `Member N ` for additional members, matching the template headers. Keyed by
    // field id (not label) to match how the rest of the platform stores
    // responses — the attendee detail view maps id → label for display.
    const readFields = (
      prefix: string,
      fields: ImportFormField[],
    ): { values: Record<string, string>; missing?: ImportFormField } => {
      const values: Record<string, string> = {};
      let missing: ImportFormField | undefined;
      for (const f of fields) {
        const val = at(cells, col(`${prefix}${f.label}`));
        if (val) values[f.id] = val;
        else if (f.required && !missing) missing = f;
      }
      return { values, missing };
    };

    const leadFields = readFields('', perMember); // the lead's per-member answers
    const teamFields = readFields('', perGroup); // team-wide answers (group only)
    const base: ParsedImportRow = {
      line,
      name,
      email,
      mobile,
      groupSize: null,
      groupMembers: null,
      // For a group, only the team-wide answers live at the registration level;
      // each member's answers are captured per member (below). For an individual
      // ticket every field is per-member and lives here.
      formResponses: shape.kind === 'GROUP' ? teamFields.values : leadFields.values,
    };

    if (!name) {
      rows.push({ ...base, error: 'Missing name.' });
      continue;
    }
    if (!email || !EMAIL_RE.test(email)) {
      rows.push({ ...base, error: `Invalid or missing email "${email}".` });
      continue;
    }
    // Mobile is mandatory for the primary attendee.
    if (!mobile || !MOBILE_RE.test(mobile)) {
      rows.push({ ...base, error: `Invalid or missing 10-digit mobile "${mobile ?? ''}".` });
      continue;
    }
    // Team-wide required questions must be answered once.
    if (teamFields.missing) {
      rows.push({ ...base, error: `Missing required team field "${teamFields.missing.label}".` });
      continue;
    }
    // The lead must answer their own required per-member fields.
    if (leadFields.missing) {
      rows.push({ ...base, error: `Missing required field "${leadFields.missing.label}".` });
      continue;
    }

    if (shape.kind === 'GROUP') {
      const declared = groupSizeCol >= 0 ? parseInt(at(cells, groupSizeCol), 10) : NaN;
      // Gather members present in the row (lead is member 1, with its own fields).
      const members: ImportedMember[] = [
        { name, email, mobile, customFields: leadFields.values },
      ];
      for (let s = 0; s < slots; s++) {
        const n = s + 2;
        const h = memberHeaders(n);
        const mName = at(cells, col(h.name));
        const mEmail = at(cells, col(h.email)).toLowerCase();
        const mMobile = at(cells, col(h.mobile)) || null;
        const mFields = readFields(`Member ${n} `, perMember);
        const hasAny =
          mName || mEmail || mMobile || Object.keys(mFields.values).length > 0;
        if (!hasAny) continue; // empty slot
        if (mEmail && !EMAIL_RE.test(mEmail)) {
          base.error = `Member ${n} has an invalid email "${mEmail}".`;
          break;
        }
        if (mFields.missing) {
          base.error = `Member ${n} is missing required field "${mFields.missing.label}".`;
          break;
        }
        members.push({
          name: mName || 'Guest',
          email: mEmail || null,
          mobile: mMobile,
          customFields: mFields.values,
        });
      }
      if (base.error) {
        rows.push(base);
        continue;
      }
      const size = Number.isFinite(declared) && declared > 0 ? declared : members.length;
      if (
        (shape.minGroupSize != null && size < shape.minGroupSize) ||
        (shape.maxGroupSize != null && size > shape.maxGroupSize)
      ) {
        rows.push({
          ...base,
          error: `Group size ${size} is outside the allowed ${shape.minGroupSize ?? 1}–${shape.maxGroupSize ?? '∞'}.`,
        });
        continue;
      }
      rows.push({ ...base, groupSize: size, groupMembers: members });
      continue;
    }

    rows.push(base);
  }

  return { rows };
}
