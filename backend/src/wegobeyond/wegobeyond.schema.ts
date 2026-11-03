/**
 * What Apex › WeGoBeyond can edit, described once (ported from the site's
 * lib/apex/schema.ts). Apex builds its forms from this spec (it comes back with
 * every admin read) and every save is re-validated against it here: nothing
 * reaches wegobeyond_docs without passing validateDoc.
 */

import { cleanFormFields } from './crew-form';

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'lines'
  | 'email'
  | 'url'
  | 'date'
  | 'slug'
  | 'select'
  | 'image';

/** Roles in "The crew." credits, in the order the groups appear. */
export const CREW_ROLES_SHOWN = [
  'Speaker',
  'Host',
  'Mentor',
  'Judge',
  'Volunteer',
  'Organiser',
] as const;

/** A photo committed to the site itself (its public/gallery folder). */
export const UPLOAD_PATH = /^\/gallery\/[a-z0-9-]+\.(?:jpg|png|webp)$/;

export type Field = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: readonly string[];
  hint?: string;
  max?: number;
  /** Store lines/text in lowercase (used for event-matching phrases). */
  lowercase?: boolean;
};

export type ListSpec = {
  key: string;
  title: string;
  itemLabel: string;
  /** Field shown as the row's name when collapsed. */
  titleKey: string;
  fields: Field[];
  /** Field that must be unique across the list. */
  unique?: string;
  max?: number;
};

export const DOC_NAMES = [
  'initiatives',
  'gallery',
  'team',
  'press',
  'crew',
  'settings',
] as const;
export type DocName = (typeof DOC_NAMES)[number];

export type DocSpec = {
  title: string;
  blurb: string;
  fields: Field[];
  lists: ListSpec[];
};

export const DOCS: Record<DocName, DocSpec> = {
  initiatives: {
    title: 'Initiatives',
    blurb:
      'The home Initiatives grid and every /initiative page. Order here is the order on the site.',
    fields: [],
    lists: [
      {
        key: 'initiatives',
        title: 'Initiatives',
        itemLabel: 'initiative',
        titleKey: 'name',
        unique: 'slug',
        max: 30,
        fields: [
          { key: 'name', label: 'Name', kind: 'text', required: true, max: 80 },
          {
            key: 'slug',
            label: 'Page address',
            kind: 'slug',
            required: true,
            hint: 'wegobeyond.in/initiative/<this>. Lowercase letters, numbers and dashes.',
          },
          {
            key: 'note',
            label: 'Rust note',
            kind: 'text',
            required: true,
            max: 40,
            hint: 'Format or status, e.g. Workshop, Invite only.',
          },
          {
            key: 'body',
            label: 'One line (home grid)',
            kind: 'text',
            required: true,
            max: 140,
          },
          {
            key: 'intro',
            label: 'Intro (page)',
            kind: 'textarea',
            required: true,
            max: 600,
          },
          {
            key: 'agenda',
            label: 'What happens',
            kind: 'lines',
            hint: 'One item per line, in order. Leave empty to hide.',
          },
          {
            key: 'audience',
            label: "Who it's for",
            kind: 'textarea',
            max: 300,
            hint: 'Leave empty to hide.',
          },
          {
            key: 'match',
            label: 'Event match phrases',
            kind: 'lines',
            lowercase: true,
            hint: 'Unifesto events whose title or address contains one of these show on this page. One per line.',
          },
        ],
      },
    ],
  },
  gallery: {
    title: 'Moments & memories',
    blurb:
      "The photo gallery on the home page. It stays hidden until there's at least one photo. Order here is the order on the site.",
    fields: [],
    lists: [
      {
        key: 'photos',
        title: 'Photos',
        itemLabel: 'photo',
        titleKey: 'caption',
        max: 60,
        fields: [
          {
            key: 'src',
            label: 'Photo',
            kind: 'image',
            required: true,
            hint: 'Upload a JPG, PNG or WebP up to 3 MB, or paste an https:// link.',
          },
          {
            key: 'alt',
            label: 'Describe the photo (for screen readers)',
            kind: 'text',
            required: true,
            max: 160,
          },
          {
            key: 'caption',
            label: 'Caption',
            kind: 'text',
            max: 120,
            hint: 'Shown under the photo, e.g. Build with AIA, Dec 2026.',
          },
        ],
      },
    ],
  },
  team: {
    title: 'The crew',
    blurb:
      'Everyone who makes the rooms happen: speakers, hosts, mentors, judges, volunteers. Shown on wegobeyond.in/crew as “Role at Event” (or just the role); order here is the order on the page.',
    fields: [],
    lists: [
      {
        key: 'members',
        title: 'People',
        itemLabel: 'person',
        titleKey: 'name',
        max: 300,
        fields: [
          { key: 'name', label: 'Name', kind: 'text', required: true, max: 60 },
          {
            key: 'role',
            label: 'Role',
            kind: 'select',
            required: true,
            options: CREW_ROLES_SHOWN,
          },
          {
            key: 'event',
            label: 'Event name',
            kind: 'text',
            max: 80,
            hint: 'Optional, e.g. Build with AIA. Shows as “Speaker at Build with AIA”; leave empty for just the role.',
          },
        ],
      },
    ],
  },
  press: {
    title: 'Releases & press',
    blurb:
      'The Releases & press section on the home page. Releases show newest first.',
    fields: [
      {
        key: 'boilerplate',
        label: 'About WeGoBeyond (boilerplate)',
        kind: 'textarea',
        required: true,
        max: 600,
      },
      {
        key: 'pressEmail',
        label: 'Press contact email',
        kind: 'email',
        required: true,
      },
    ],
    lists: [
      {
        key: 'releases',
        title: 'Releases',
        itemLabel: 'release',
        titleKey: 'title',
        max: 100,
        fields: [
          { key: 'date', label: 'Date', kind: 'date', required: true },
          {
            key: 'title',
            label: 'Title',
            kind: 'text',
            required: true,
            max: 120,
          },
          {
            key: 'body',
            label: 'Text',
            kind: 'textarea',
            required: true,
            max: 800,
          },
        ],
      },
    ],
  },
  crew: {
    title: 'Crew form',
    blurb:
      'The Join the crew page and its sign-up form: page text, then the questions in order. Every sign-up is checked against these questions.',
    // The questions (`fields`) have their own shape and checks: crew-form.ts.
    fields: [
      {
        key: 'intro',
        label: 'Page intro',
        kind: 'textarea',
        required: true,
        max: 300,
      },
      {
        key: 'consent',
        label: 'Consent line (checkbox)',
        kind: 'textarea',
        required: true,
        max: 300,
      },
      {
        key: 'submitLabel',
        label: 'Submit button',
        kind: 'text',
        required: true,
        max: 300,
      },
      {
        key: 'successTitle',
        label: 'After sending: title',
        kind: 'text',
        required: true,
        max: 300,
      },
      {
        key: 'successBody',
        label: 'After sending: text',
        kind: 'textarea',
        required: true,
        max: 300,
      },
    ],
    lists: [],
  },
  settings: {
    title: 'Site settings',
    blurb: 'Hero line, contact emails, social links and policy links.',
    fields: [
      {
        key: 'heroLead',
        label: 'Hero line',
        kind: 'text',
        required: true,
        max: 140,
      },
      {
        key: 'partnersInbox',
        label: 'Partnerships email (Partner with us)',
        kind: 'email',
        required: true,
      },
      {
        key: 'supportInbox',
        label: 'Support email (contact form, crew page)',
        kind: 'email',
        required: true,
      },
    ],
    lists: [
      {
        key: 'contacts',
        title: 'Contacts (Say hello)',
        itemLabel: 'contact',
        titleKey: 'role',
        max: 10,
        fields: [
          {
            key: 'role',
            label: 'Label',
            kind: 'text',
            required: true,
            max: 40,
          },
          { key: 'addr', label: 'Email', kind: 'email', required: true },
        ],
      },
      {
        key: 'socials',
        title: 'Social links (footer)',
        itemLabel: 'social link',
        titleKey: 'href',
        max: 20,
        fields: [
          {
            key: 'brand',
            label: 'Brand',
            kind: 'select',
            required: true,
            options: ['wegobeyond', 'unifesto'],
          },
          {
            key: 'network',
            label: 'Network',
            kind: 'select',
            required: true,
            options: ['instagram', 'linkedin', 'x', 'youtube'],
          },
          {
            key: 'label',
            label: 'Name',
            kind: 'text',
            required: true,
            max: 30,
          },
          { key: 'href', label: 'Profile link', kind: 'url', required: true },
        ],
      },
      {
        key: 'policies',
        title: 'Policy links (footer)',
        itemLabel: 'policy link',
        titleKey: 'label',
        max: 12,
        fields: [
          {
            key: 'label',
            label: 'Label',
            kind: 'text',
            required: true,
            max: 40,
          },
          { key: 'href', label: 'Link', kind: 'url', required: true },
        ],
      },
    ],
  },
};

export const isDocName = (v: string): v is DocName => Object.hasOwn(DOCS, v);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS = /^https:\/\/[^\s]+$/;

/** Clean one field's value, or return an error message. */
function cleanField(
  f: Field,
  raw: unknown,
): { value: unknown } | { error: string } {
  // A missing optional field (an entry saved before the field existed) is just empty.
  if (raw === undefined || raw === null) {
    if (f.required) return { error: 'is required' };
    return { value: f.kind === 'lines' ? [] : '' };
  }
  if (f.kind === 'lines') {
    if (!Array.isArray(raw) || raw.some((l) => typeof l !== 'string')) {
      return { error: 'must be a list of lines' };
    }
    const lines = (raw as string[])
      .map((l) => (f.lowercase ? l.trim().toLowerCase() : l.trim()))
      .filter(Boolean);
    if (f.required && lines.length === 0)
      return { error: 'needs at least one line' };
    if (lines.length > 50) return { error: 'has more than 50 lines' };
    if (lines.some((l) => l.length > 300))
      return { error: 'has a line over 300 characters' };
    return { value: lines };
  }
  if (typeof raw !== 'string') return { error: 'must be text' };
  const v = f.lowercase ? raw.trim().toLowerCase() : raw.trim();
  if (!v) return f.required ? { error: 'is required' } : { value: '' };
  const max = f.max ?? (f.kind === 'textarea' ? 2000 : 300);
  if (v.length > max) return { error: `is over ${max} characters` };
  if (f.kind === 'email' && !EMAIL.test(v))
    return { error: "isn't a valid email" };
  if (f.kind === 'url' && !HTTPS.test(v))
    return { error: 'must be a full https:// link' };
  if (f.kind === 'image' && !UPLOAD_PATH.test(v) && !HTTPS.test(v)) {
    return { error: 'must be an uploaded photo or a full https:// link' };
  }
  if (f.kind === 'slug' && !SLUG.test(v)) {
    return { error: 'must be lowercase letters, numbers and dashes' };
  }
  if (f.kind === 'date' && (!DATE.test(v) || Number.isNaN(Date.parse(v)))) {
    return { error: 'must be a date' };
  }
  if (f.kind === 'select' && !f.options?.includes(v)) {
    return { error: `must be one of ${f.options?.join(', ')}` };
  }
  return { value: v };
}

function cleanObject(
  fields: Field[],
  raw: unknown,
  where: string,
  errors: string[],
) {
  const out: Record<string, unknown> = {};
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  for (const f of fields) {
    const r = cleanField(f, obj[f.key]);
    if ('error' in r) errors.push(`${where}${f.label} ${r.error}.`);
    else out[f.key] = r.value;
  }
  return out;
}

/** Validate and normalise a whole document. Unknown keys are dropped. */
export function validateDoc(
  name: DocName,
  input: unknown,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errors: string[] } {
  const spec = DOCS[name];
  const errors: string[] = [];
  const value = cleanObject(spec.fields, input, '', errors);
  const obj =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};

  for (const list of spec.lists) {
    const items = obj[list.key];
    if (!Array.isArray(items)) {
      errors.push(`${list.title} is missing.`);
      continue;
    }
    if (items.length > (list.max ?? 100)) {
      errors.push(`${list.title} has more than ${list.max ?? 100} entries.`);
    }
    const cleaned = items.map((item, i) => {
      const label = (item as Record<string, unknown>)?.[list.titleKey];
      return cleanObject(
        list.fields,
        item,
        `${list.title} #${i + 1}${typeof label === 'string' && label ? ` (${label})` : ''}: `,
        errors,
      );
    });
    if (list.unique) {
      const seen = new Set<unknown>();
      for (const it of cleaned) {
        const k = it[list.unique] as string | undefined; // unique keys are text fields
        if (k && seen.has(k))
          errors.push(`${list.title}: "${k}" is used twice.`);
        seen.add(k);
      }
    }
    value[list.key] = cleaned;
  }

  if (name === 'crew') value.fields = cleanFormFields(obj.fields, errors);

  return errors.length ? { ok: false, errors } : { ok: true, value };
}
