import { FormFieldType } from '@prisma/client';

/**
 * Registration-question rules (4.0.0 item 0.9). The backend is the source of
 * truth: every path that saves answers runs them through `checkAnswers`, and
 * the question editor runs definitions through `checkFieldDefinition`.
 * Clients mirror these rules for instant feedback only.
 */

/** The 28 states and 8 union territories, as answers to a STATE question. */
export const INDIAN_STATES_AND_UTS = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export type FileKind = 'pdf' | 'image' | 'doc';

/** MIME types accepted for each file kind an organiser can allow. */
export const FILE_KIND_MIMES: Record<FileKind, string[]> = {
  pdf: ['application/pdf'],
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  doc: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};
export const FILE_DEFAULT_KINDS: FileKind[] = ['pdf', 'image'];
export const FILE_DEFAULT_MAX_MB = 5;
export const FILE_MAX_MB_CAP = 10;

/** Hard caps so one answer can't bloat a registration row. */
const TEXT_CAP: Partial<Record<FormFieldType, number>> = {
  TEXT: 500,
  TEXTAREA: 5000,
  EMAIL: 320,
  PHONE: 30,
  URL: 2000,
};

/** Types whose answer can drive a show-if condition. */
export const CHOICE_TYPES: FormFieldType[] = [
  'SELECT',
  'RADIO',
  'CHECKBOX',
  'YES_NO',
  'STATE',
];
/** Types where the organiser lists the options. */
export const OPTION_TYPES: FormFieldType[] = ['SELECT', 'RADIO', 'CHECKBOX'];

export interface FormFieldConfig {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  minDate?: string;
  maxDate?: string;
  minPicks?: number;
  maxPicks?: number;
  scale?: 5 | 10;
  fileKinds?: FileKind[];
  maxSizeMb?: number;
}

export interface ShowIf {
  fieldId: string;
  anyOf: string[];
}

export interface FormFieldLike {
  id: string;
  label: string;
  type: FormFieldType;
  options: string[];
  isRequired: boolean;
  perGroup?: boolean;
  order?: number;
  config?: unknown;
  showIf?: unknown;
}

export interface FileAnswer {
  key: string;
  name: string;
  size: number;
  mime: string;
}

export const cfg = (f: Pick<FormFieldLike, 'config'>): FormFieldConfig =>
  f.config && typeof f.config === 'object' && !Array.isArray(f.config)
    ? f.config
    : {};

export const showIfOf = (f: Pick<FormFieldLike, 'showIf'>): ShowIf | null => {
  const s = f.showIf as ShowIf | null | undefined;
  return s && typeof s.fieldId === 'string' && Array.isArray(s.anyOf)
    ? s
    : null;
};

/** The answers a choice question offers. */
export function choicesFor(
  f: Pick<FormFieldLike, 'type' | 'options'>,
): string[] {
  if (f.type === 'STATE') return [...INDIAN_STATES_AND_UTS];
  if (f.type === 'YES_NO') return ['Yes', 'No'];
  return f.options ?? [];
}

/** An answer as the strings a show-if condition compares against. */
export function answerTokens(
  f: Pick<FormFieldLike, 'type'>,
  value: unknown,
): string[] {
  if (value === true) return ['Yes'];
  if (value === false) return f.type === 'YES_NO' ? ['No'] : [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value) return [value];
  return [];
}

/** Where an attendee's upload for one question lives. Never public. */
export const formUploadPrefix = (
  eventId: string,
  fieldId: string,
  userId: string,
) => `private/form-uploads/${eventId}/${fieldId}/${userId}/`;

export const formUploadEventPrefix = (eventId: string) =>
  `private/form-uploads/${eventId}/`;

/**
 * Ids of the questions an attendee actually sees, given their answers.
 * Walks in order: a question is hidden when its condition isn't met, or when
 * the question it depends on is itself hidden.
 */
export function visibleFieldIds(
  fields: FormFieldLike[],
  answers: Record<string, unknown>,
): Set<string> {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const visible = new Set<string>();
  for (const f of [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const cond = showIfOf(f);
    if (!cond) {
      visible.add(f.id);
      continue;
    }
    const parent = byId.get(cond.fieldId);
    // A condition on a question that no longer exists is ignored.
    if (!parent) {
      visible.add(f.id);
      continue;
    }
    if (!visible.has(parent.id)) continue;
    const tokens = answerTokens(parent, answers[parent.id]);
    if (tokens.some((t) => cond.anyOf.includes(t))) visible.add(f.id);
  }
  return visible;
}

/** Answered with one tick: YES_NO, or a legacy CHECKBOX with no options. */
export const isSingleTick = (f: Pick<FormFieldLike, 'type' | 'options'>) =>
  f.type === 'YES_NO' || (f.type === 'CHECKBOX' && !f.options?.length);

const isBlank = (v: unknown) =>
  v === undefined ||
  v === null ||
  v === '' ||
  (Array.isArray(v) && v.length === 0);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)))
    return Number(v);
  return null;
}

function toBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['yes', 'true', 'y', '1'].includes(s)) return true;
    if (['no', 'false', 'n', '0'].includes(s)) return false;
  }
  return null;
}

export interface CheckOptions {
  eventId: string;
  /** Attendee paths: true. Curator add / lead editing teammates: false. */
  enforceRequired: boolean;
  /** Who may have uploaded files referenced by these answers. */
  uploaderIds: string[];
}

/**
 * Validate and normalise one answer. Returns the value to store, or an error.
 * Blank values never reach here.
 */
function checkOne(
  f: FormFieldLike,
  raw: unknown,
  opts: CheckOptions,
): { value: unknown } | { error: string } {
  const c = cfg(f);
  const bad = (why: string) => ({ error: `${f.label}: ${why}` });

  switch (f.type) {
    case 'TEXT':
    case 'TEXTAREA':
    case 'EMAIL':
    case 'PHONE':
    case 'URL': {
      if (typeof raw !== 'string' && typeof raw !== 'number')
        return bad('must be text.');
      let s = String(raw).trim();
      if (s.length > (TEXT_CAP[f.type] ?? 500)) return bad('is too long.');
      if (c.minLength && s.length < c.minLength)
        return bad(`needs at least ${c.minLength} characters.`);
      if (c.maxLength && s.length > c.maxLength)
        return bad(`can be at most ${c.maxLength} characters.`);
      if (f.type === 'EMAIL' && !EMAIL_RE.test(s))
        return bad('enter a valid email.');
      if (f.type === 'PHONE') {
        const digits = s.replace(/\D/g, '').length;
        if (digits < 7 || digits > 15 || /[^\d+\-\s()]/.test(s))
          return bad('enter a valid phone number.');
      }
      if (f.type === 'URL') {
        if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
        try {
          const u = new URL(s);
          if (
            !['http:', 'https:'].includes(u.protocol) ||
            !u.hostname.includes('.')
          )
            throw new Error();
        } catch {
          return bad('enter a valid link.');
        }
      }
      return { value: s };
    }

    case 'NUMBER': {
      const n = toNumber(raw);
      if (n === null) return bad('must be a number.');
      if (c.min !== undefined && n < c.min)
        return bad(`must be at least ${c.min}.`);
      if (c.max !== undefined && n > c.max)
        return bad(`must be at most ${c.max}.`);
      return { value: n };
    }

    case 'RATING': {
      const n = toNumber(raw);
      const scale = c.scale === 10 ? 10 : 5;
      if (n === null || !Number.isInteger(n) || n < 1 || n > scale)
        return bad(`pick 1 to ${scale}.`);
      return { value: n };
    }

    case 'DATE': {
      if (typeof raw !== 'string' || !validDate(raw.trim()))
        return bad('enter a valid date.');
      const d = raw.trim();
      if (c.minDate && d < c.minDate)
        return bad(`must be on or after ${c.minDate}.`);
      if (c.maxDate && d > c.maxDate)
        return bad(`must be on or before ${c.maxDate}.`);
      return { value: d };
    }

    case 'YES_NO': {
      const b = toBool(raw);
      if (b === null) return bad('answer yes or no.');
      return { value: b };
    }

    case 'SELECT':
    case 'RADIO':
    case 'STATE': {
      if (typeof raw !== 'string') return bad('pick one option.');
      const s = raw.trim();
      if (!choicesFor(f).includes(s))
        return bad('pick one of the listed options.');
      return { value: s };
    }

    case 'CHECKBOX': {
      // An option-less CHECKBOX is a single tick (legacy). Old app builds also
      // sent `true` for an option list; accepted until 4.0.0 forces an update.
      if (!f.options?.length || raw === true || raw === false) {
        const b = toBool(raw);
        if (b === null) return bad('answer yes or no.');
        return { value: b };
      }
      const picks = Array.isArray(raw)
        ? raw.map((v) => String(v).trim())
        : typeof raw === 'string'
          ? raw
              .split(';')
              .map((v) => v.trim())
              .filter(Boolean)
          : null;
      if (!picks) return bad('pick from the listed options.');
      const unique = [...new Set(picks)];
      if (unique.some((p) => !f.options.includes(p)))
        return bad('pick from the listed options.');
      if (c.minPicks && unique.length < c.minPicks)
        return bad(`pick at least ${c.minPicks}.`);
      if (c.maxPicks && unique.length > c.maxPicks)
        return bad(`pick at most ${c.maxPicks}.`);
      return { value: unique };
    }

    case 'FILE': {
      const a = raw as FileAnswer;
      if (!a || typeof a !== 'object' || typeof a.key !== 'string')
        return bad('upload a file.');
      const owned = opts.uploaderIds.some((uid) =>
        a.key.startsWith(formUploadPrefix(opts.eventId, f.id, uid)),
      );
      if (!owned || a.key.includes('..')) return bad('upload the file again.');
      return {
        value: {
          key: a.key,
          name: String(a.name ?? 'file').slice(0, 200),
          size: Number(a.size) || 0,
          mime: String(a.mime ?? ''),
        } satisfies FileAnswer,
      };
    }

    default:
      return { value: raw };
  }
}

/**
 * Check a set of answers against the questions that apply to them.
 *
 * - Keys that aren't one of `fields` (e.g. `gender`, legacy keys) pass through.
 * - Hidden questions (show-if not met) and SECTION headings are dropped.
 * - Required is enforced only for visible questions and only when asked.
 */
export function checkAnswers(
  fields: FormFieldLike[],
  answers: Record<string, unknown> | null | undefined,
  opts: CheckOptions,
): { answers: Record<string, unknown>; errors: string[] } {
  const input =
    answers && typeof answers === 'object' && !Array.isArray(answers)
      ? answers
      : {};
  const out: Record<string, unknown> = { ...input };
  const errors: string[] = [];
  const visible = visibleFieldIds(fields, input);

  for (const f of fields) {
    const raw = input[f.id];
    if (f.type === 'SECTION' || !visible.has(f.id)) {
      delete out[f.id];
      continue;
    }
    if (isBlank(raw)) {
      delete out[f.id];
      if (f.isRequired && opts.enforceRequired)
        errors.push(`${f.label} is required.`);
      continue;
    }
    const r = checkOne(f, raw, opts);
    if ('error' in r) {
      errors.push(r.error);
      continue;
    }
    out[f.id] = r.value;
    // A single tick is answered by ticking it: a required one (consent) must
    // be true, not merely present.
    if (
      r.value === false &&
      f.isRequired &&
      opts.enforceRequired &&
      isSingleTick(f)
    ) {
      errors.push(`${f.label} is required.`);
    }
  }

  return { answers: out, errors };
}

/** Which limit keys each type may carry; anything else is dropped. */
const CONFIG_KEYS: Partial<Record<FormFieldType, (keyof FormFieldConfig)[]>> = {
  TEXT: ['minLength', 'maxLength'],
  TEXTAREA: ['minLength', 'maxLength'],
  NUMBER: ['min', 'max'],
  DATE: ['minDate', 'maxDate'],
  CHECKBOX: ['minPicks', 'maxPicks'],
  RATING: ['scale'],
  FILE: ['fileKinds', 'maxSizeMb'],
};

/**
 * Keep only the limits that apply to `type`, with the right value types.
 * Returns null when nothing is left (stored as SQL NULL).
 */
export function sanitizeConfig(
  type: FormFieldType,
  raw: unknown,
): FormFieldConfig | null {
  const src = cfg({ config: raw }) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of CONFIG_KEYS[type] ?? []) {
    const v = src[k];
    if (v === undefined || v === null || v === '') continue;
    if (k === 'minDate' || k === 'maxDate') {
      if (typeof v === 'string') out[k] = v.trim();
    } else if (k === 'fileKinds') {
      if (Array.isArray(v)) out[k] = [...new Set(v.map(String))];
    } else if (k === 'scale') {
      out[k] = Number(v) === 10 ? 10 : 5;
    } else {
      const n = Number(v);
      if (isFinite(n))
        out[k] = k === 'min' || k === 'max' ? n : Math.max(0, Math.floor(n));
    }
  }
  return Object.keys(out).length ? out : null;
}

/** A question as the editor submits it. */
export interface FieldDefinitionInput {
  id?: string;
  type: FormFieldType;
  options: string[];
  perGroup: boolean;
  order: number;
  config?: unknown;
  showIf?: unknown;
}

/**
 * Check a question definition. `siblings` are the other questions on the same
 * ticket (or the event-wide form). Returns an error message or null.
 */
export function checkFieldDefinition(
  def: FieldDefinitionInput,
  siblings: FormFieldLike[],
): string | null {
  const c = cfg(def);
  if (
    OPTION_TYPES.includes(def.type) &&
    def.type !== 'CHECKBOX' &&
    def.options.length === 0
  ) {
    return 'Add at least one option for this question.';
  }
  if (def.type === 'CHECKBOX' && def.options.length === 0) {
    return 'Add at least one option, or use a Yes / No question for a single tick.';
  }
  if (new Set(def.options.map((o) => o.trim())).size !== def.options.length) {
    return 'Options must be different from each other.';
  }
  const pair = (lo?: number, hi?: number, what = 'limits') =>
    lo !== undefined && hi !== undefined && lo > hi
      ? `The minimum is above the maximum (${what}).`
      : null;
  const err =
    pair(c.minLength, c.maxLength, 'length') ??
    pair(c.min, c.max, 'number') ??
    pair(c.minPicks, c.maxPicks, 'picks') ??
    (c.minDate && c.maxDate && c.minDate > c.maxDate
      ? 'The earliest date is after the latest.'
      : null);
  if (err) return err;
  if (
    (c.minDate && !validDate(c.minDate)) ||
    (c.maxDate && !validDate(c.maxDate))
  ) {
    return 'Dates must be YYYY-MM-DD.';
  }
  if (c.maxPicks && def.options.length && c.maxPicks > def.options.length) {
    return 'Maximum picks is more than the number of options.';
  }
  if (
    c.maxSizeMb !== undefined &&
    (c.maxSizeMb < 1 || c.maxSizeMb > FILE_MAX_MB_CAP)
  ) {
    return `File size limit must be 1 to ${FILE_MAX_MB_CAP} MB.`;
  }
  if (
    c.fileKinds &&
    (!c.fileKinds.length || c.fileKinds.some((k) => !(k in FILE_KIND_MIMES)))
  ) {
    return 'Allow at least one file type (PDF, image or document).';
  }

  const cond = showIfOf(def);
  if (def.showIf && !cond)
    return 'Show-if needs a question and at least one answer.';
  if (cond) {
    if (def.type === 'SECTION')
      return "A section heading can't have a condition.";
    const parent = siblings.find((s) => s.id === cond.fieldId);
    if (!parent || parent.id === def.id)
      return 'Show-if must point to another question on this ticket.';
    if (!CHOICE_TYPES.includes(parent.type))
      return 'Show-if can only depend on a choice or Yes / No question.';
    if ((parent.order ?? 0) >= def.order)
      return 'Show-if must depend on a question that comes earlier.';
    if (!!parent.perGroup !== def.perGroup) {
      return 'Show-if must depend on a question asked the same way (once per team or per member).';
    }
    if (
      !cond.anyOf.length ||
      cond.anyOf.some((a) => !choicesFor(parent).includes(a))
    ) {
      return 'Show-if answers must be options of that question.';
    }
  }
  return null;
}

/** An answer as plain text, for exports, emails and summaries. */
export function formatAnswer(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'object') {
    const file = value as Partial<FileAnswer>;
    if (typeof file.key === 'string') return file.name || 'File';
    return JSON.stringify(value);
  }
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}
