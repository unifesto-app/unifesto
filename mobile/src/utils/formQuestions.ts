/**
 * Registration-question rules on the phone. The backend
 * (`backend/src/registrations/form-answers.util.ts`) is the source of truth
 * and re-checks every answer; this mirrors it so people see problems before
 * they pay. Keep the two in step.
 */
import { EMAIL_RE } from '../lib/constants';
import type { CustomField } from '../lib/api/tickets';

export const INDIAN_STATES_AND_UTS = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

export type FileKind = 'pdf' | 'image' | 'doc';
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

export interface FileAnswer {
  key: string;
  name: string;
  size: number;
  mime: string;
}

export const isFileAnswer = (v: unknown): v is FileAnswer =>
  !!v && typeof v === 'object' && typeof (v as FileAnswer).key === 'string';

/** Answered with one tick: yes/no, or a legacy option-less checkbox. */
export const isSingleTick = (f: CustomField) => f.field_type === 'yes_no' || f.field_type === 'checkbox';

/** The answers a choice question offers. */
export function choicesFor(f: CustomField): string[] {
  if (f.field_type === 'state') return INDIAN_STATES_AND_UTS;
  if (f.field_type === 'yes_no') return ['Yes', 'No'];
  return (f.options_json ?? []).map((o) => o.value);
}

function tokens(f: CustomField, v: unknown): string[] {
  if (v === true) return ['Yes'];
  if (v === false) return f.field_type === 'yes_no' ? ['No'] : [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v) return [v];
  return [];
}

/**
 * The questions to show, in order, given the answers so far. A question is
 * hidden when its show-if isn't met or the question it depends on is hidden.
 */
export function visibleFields(fields: CustomField[], answers: Record<string, unknown> = {}): CustomField[] {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const shown = new Set<string>();
  const out: CustomField[] = [];
  for (const f of [...fields].sort((a, b) => a.display_order - b.display_order)) {
    const cond = f.show_if;
    const parent = cond ? byId.get(cond.field_id) : undefined;
    const ok = !cond || !parent || (shown.has(parent.id) && tokens(parent, answers[parent.id]).some((t) => cond.any_of.includes(t)));
    if (ok) {
      shown.add(f.id);
      out.push(f);
    }
  }
  return out;
}

const isBlank = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A number answer as it is typed: kept as text so "8." and "-" survive the
 * keystroke on the way to "8.5" or "-3" (the backend turns it into a number).
 * A comma counts as the decimal point. null = ignore the keystroke.
 */
export function numberDraft(text: string): string | null {
  const t = text.replace(',', '.');
  return /^-?\d*\.?\d*$/.test(t) ? t : null;
}

/** What's wrong with a non-blank answer, or null. */
export function answerProblem(f: CustomField, v: unknown): string | null {
  const c = f.config ?? {};
  const s = typeof v === 'string' ? v.trim() : '';
  switch (f.field_type) {
    case 'text':
    case 'textarea':
      if (c.minLength && s.length < c.minLength) return `needs at least ${c.minLength} characters`;
      if (c.maxLength && s.length > c.maxLength) return `can be at most ${c.maxLength} characters`;
      return null;
    case 'email':
      return EMAIL_RE.test(s) ? null : 'enter a valid email';
    case 'phone': {
      const d = s.replace(/\D/g, '').length;
      return d >= 7 && d <= 15 ? null : 'enter a valid phone number';
    }
    case 'url':
      return /^(https?:\/\/)?[^\s/]+\.[^\s]+$/i.test(s) ? null : 'enter a valid link';
    case 'number': {
      const n = typeof v === 'number' ? v : Number(s);
      if (!isFinite(n)) return 'must be a number';
      if (c.min !== undefined && n < c.min) return `must be at least ${c.min}`;
      if (c.max !== undefined && n > c.max) return `must be at most ${c.max}`;
      return null;
    }
    case 'date':
      if (!DATE_RE.test(s)) return 'pick a date';
      if (c.minDate && s < c.minDate) return `must be on or after ${c.minDate}`;
      if (c.maxDate && s > c.maxDate) return `must be on or before ${c.maxDate}`;
      return null;
    case 'multi_select': {
      const n = Array.isArray(v) ? v.length : 0;
      if (c.minPicks && n < c.minPicks) return `pick at least ${c.minPicks}`;
      if (c.maxPicks && n > c.maxPicks) return `pick at most ${c.maxPicks}`;
      return null;
    }
    default:
      return null;
  }
}

/**
 * The first problem in a set of answers (visible questions only), as a
 * sentence, or null when everything checks out.
 */
export function firstFormProblem(
  fields: CustomField[],
  answers: Record<string, unknown> | undefined,
  { enforceRequired = true }: { enforceRequired?: boolean } = {},
): string | null {
  const a = answers ?? {};
  for (const f of visibleFields(fields, a)) {
    if (f.field_type === 'section') continue;
    const v = a[f.id];
    const unticked = isSingleTick(f) && v !== true;
    if (isBlank(v) || unticked) {
      if (enforceRequired && f.is_required) return `${f.label} is required.`;
      continue;
    }
    const p = answerProblem(f, v);
    if (p) return `${f.label}: ${p}.`;
  }
  return null;
}

/** An answer as display text. */
export function displayAnswer(f: CustomField | undefined, v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.join(', ');
  if (isFileAnswer(v)) return v.name || 'File';
  if (typeof v === 'object') return '';
  if (f?.field_type === 'rating') return `${v} / ${f.config?.scale === 10 ? 10 : 5}`;
  if (f?.field_type === 'date' && typeof v === 'string' && DATE_RE.test(v)) {
    return new Date(`${v}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (f && (f.field_type === 'dropdown' || f.field_type === 'radio')) {
    return f.options_json?.find((o) => o.value === v)?.label || String(v);
  }
  return String(v);
}
