/**
 * The crew sign-up form as data (port of the site's lib/crewForm.ts). Apex's
 * form builder edits the definition, wegobeyond.in draws the form from it, and
 * every sign-up is checked against the same one by validateSubmission.
 */

export type FieldType =
  | 'short'
  | 'long'
  | 'email'
  | 'phone'
  | 'url'
  | 'number'
  | 'date'
  | 'choice' // pick one
  | 'multi' // pick any
  | 'yesno'
  | 'heading'; // a section title and line of text, no input

export type FieldWidth = 'full' | 'half' | 'third';
export type ChoiceDisplay = 'dropdown' | 'pills' | 'tiles' | 'list';

export type FormField = {
  /** Stable answer key, lowercase-and-dashes. Never reuse one for a different question. */
  id: string;
  type: FieldType;
  label: string;
  help: string;
  placeholder: string;
  required: boolean;
  /** For choice and multi. A line can carry a hint after " | " (shown in tiles and list). */
  options: string[];
  width: FieldWidth;
  /** For choice and multi; dropdown only applies to choice. */
  display: ChoiceDisplay;
};

export type CrewFormDef = {
  intro: string;
  consent: string;
  submitLabel: string;
  successTitle: string;
  successBody: string;
  fields: FormField[];
};

export const FIELD_TYPES: FieldType[] = [
  'short',
  'long',
  'email',
  'phone',
  'url',
  'number',
  'date',
  'choice',
  'multi',
  'yesno',
  'heading',
];
export const FIELD_WIDTHS: FieldWidth[] = ['full', 'half', 'third'];
export const CHOICE_DISPLAYS: ChoiceDisplay[] = [
  'dropdown',
  'pills',
  'tiles',
  'list',
];

/** Always on the form, with these types and always required; can be renamed, resized and moved. */
export const CORE_FIELDS: Record<string, FieldType> = {
  name: 'short',
  email: 'email',
  phone: 'phone',
  city: 'short',
};

/** Keys the sign-up payload uses for itself; no question may take one as its id. */
export const RESERVED_IDS = [
  'consent',
  'company_website',
  'timestamp',
  'event',
  'answers',
];

/** Answers with their own wegobeyond_crew_signups column; every other one goes in `answers`. */
export const COLUMN_FIELDS = [
  'name',
  'email',
  'phone',
  'city',
  'organization',
  'role',
  'interests',
  'availability',
  'experience',
  'links',
] as const;

/** "Label | hint" → { label, hint }. The stored answer is always the label. */
export function parseOption(line: string) {
  const [label, ...rest] = line.split(' | ');
  return { label: label.trim(), hint: rest.join(' | ').trim() };
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_FIELDS = 40;
const MAX_OPTIONS = 50;

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Validate and normalise the form's questions (the `fields` of the crew
 * document). Unknown keys are dropped; options are kept only where they mean
 * something, and a multi can't be a dropdown (it falls back to pills).
 */
export function cleanFormFields(raw: unknown, errors: string[]): FormField[] {
  if (!Array.isArray(raw)) {
    errors.push('Questions are missing.');
    return [];
  }
  if (raw.length > MAX_FIELDS)
    errors.push(`Questions: more than ${MAX_FIELDS}.`);

  const seen = new Set<string>();
  const fields = raw.map((item: unknown, i): FormField => {
    const obj =
      item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const label = text(obj.label);
    const where = `Question #${i + 1}${label ? ` (${label})` : ''}:`;
    const err = (m: string) => errors.push(`${where} ${m}`);

    const id = text(obj.id);
    if (!ID.test(id))
      err('the answer key must be lowercase letters, numbers and dashes.');
    else if (RESERVED_IDS.includes(id))
      err(`"${id}" is reserved; pick another answer key.`);
    else if (seen.has(id)) err(`the answer key "${id}" is used twice.`);
    seen.add(id);

    const type = obj.type as FieldType;
    if (!FIELD_TYPES.includes(type)) err('pick a question type.');
    const width = obj.width as FieldWidth;
    if (!FIELD_WIDTHS.includes(width))
      err('width must be full, half or third.');
    let display = obj.display as ChoiceDisplay;
    if (!CHOICE_DISPLAYS.includes(display))
      err('display must be dropdown, pills, tiles or list.');
    if (type === 'multi' && display === 'dropdown') display = 'pills';

    if (!label) err('needs a label.');
    else if (label.length > 120) err('the label is over 120 characters.');
    const help = text(obj.help);
    if (help.length > 300) err('the help text is over 300 characters.');
    const placeholder = text(obj.placeholder);
    if (placeholder.length > 120)
      err('the placeholder is over 120 characters.');
    const required = type !== 'heading' && obj.required === true;

    let options: string[] = [];
    if (type === 'choice' || type === 'multi') {
      options = (Array.isArray(obj.options) ? obj.options : [])
        .filter((o): o is string => typeof o === 'string')
        .map((o) => o.trim())
        .filter(Boolean);
      const labels = options.map((o) => parseOption(o).label);
      if (options.length === 0) err('needs at least one option.');
      if (options.length > MAX_OPTIONS)
        err(`has more than ${MAX_OPTIONS} options.`);
      if (options.some((o) => o.length > 200))
        err('has an option over 200 characters.');
      if (labels.some((l) => !l))
        err('has an option with no label before " | ".');
      if (new Set(labels).size !== labels.length)
        err('has the same option twice.');
    }

    const core = CORE_FIELDS[id];
    if (core && type !== core)
      err(`must stay a ${core} question (it's a contact detail).`);
    if (core && !required) err("must stay required (it's a contact detail).");

    return {
      id,
      type,
      label,
      help,
      placeholder,
      required,
      options,
      width,
      display,
    };
  });

  for (const id of Object.keys(CORE_FIELDS)) {
    if (!seen.has(id))
      errors.push(`Questions: the "${id}" question can't be removed.`);
  }
  return fields;
}

export type Answer = string | string[];
export type Values = Record<string, Answer>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+()\-.\s]{7,20}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX: Partial<Record<FieldType, number>> = {
  short: 200,
  long: 2000,
  url: 500,
  email: 200,
  phone: 20,
  number: 30,
};

const asList = (v: unknown) =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim())
    : [];

/**
 * Check one submission against the form (same rules as the site's). Unknown
 * keys are ignored, choices must be one of the field's own options, and every
 * value is length-capped, so nothing arbitrary is stored.
 */
export function validateSubmission(
  def: CrewFormDef,
  raw: Record<string, unknown>,
) {
  const errors: Record<string, string> = {};
  const clean: Values = {};

  for (const f of def.fields) {
    if (f.type === 'heading') continue;
    const labels = f.options.map((o) => parseOption(o).label);

    if (f.type === 'multi') {
      const picked = asList(raw[f.id]).filter((v) => labels.includes(v));
      if (f.required && picked.length === 0)
        errors[f.id] = 'Pick at least one.';
      clean[f.id] = picked;
      continue;
    }

    const v = text(raw[f.id]);
    clean[f.id] = v;
    if (!v) {
      if (f.required) {
        errors[f.id] =
          f.type === 'choice' || f.type === 'yesno'
            ? 'Pick one.'
            : 'This is required.';
      }
      continue;
    }
    const max = MAX[f.type];
    if (max && v.length > max)
      errors[f.id] = `Keep this under ${max} characters.`;
    else if (f.type === 'email' && !EMAIL.test(v))
      errors[f.id] = 'That email doesn’t look right.';
    else if (f.type === 'phone' && !PHONE.test(v))
      errors[f.id] = 'That number doesn’t look right.';
    else if (f.type === 'url' && !URL_RE.test(v))
      errors[f.id] = 'Use a full link, starting with https://';
    else if (f.type === 'number' && Number.isNaN(Number(v)))
      errors[f.id] = 'Use a number.';
    else if (
      f.type === 'date' &&
      (!DATE.test(v) || Number.isNaN(Date.parse(v)))
    )
      errors[f.id] = 'Use a date.';
    else if (f.type === 'choice' && !labels.includes(v))
      errors[f.id] = 'Pick one of the options.';
    else if (f.type === 'yesno' && v !== 'Yes' && v !== 'No')
      errors[f.id] = 'Pick yes or no.';
  }

  return { errors, clean };
}
