import { call } from './manageEvent';

/*
 * The public event page's content sections: agenda, speakers, prizes,
 * contacts and FAQs. Each is a flat list with the same create / update /
 * delete shape under /events/:id/<section>, so one set of calls serves all
 * five. Needs event:edit; changes are live immediately.
 */

export type ContentSection = 'agenda' | 'speakers' | 'prizes' | 'contacts' | 'faqs';

export type FieldKind = 'text' | 'multiline' | 'url' | 'email' | 'phone' | 'datetime';

export interface ContentField {
  key: string;
  label: string;
  kind?: FieldKind;
  required?: boolean;
  placeholder?: string;
}

/** A content row as the event payload returns it: id + order + string fields. */
export type ContentItem = { id: string; order: number } & Record<string, string | number | null | undefined>;

interface SectionDef {
  /** Singular noun for buttons and titles. */
  noun: string;
  fields: ContentField[];
  /** Title and secondary line for the list row. */
  summary: (item: ContentItem) => { title: string; sub?: string };
}

const time = (iso: unknown) =>
  typeof iso === 'string'
    ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    : '';

export const SECTIONS: Record<ContentSection, SectionDef> = {
  agenda: {
    noun: 'agenda item',
    fields: [
      { key: 'title', label: 'Title', required: true, placeholder: 'Opening keynote' },
      { key: 'speakerName', label: 'Speaker', placeholder: 'Optional' },
      { key: 'startTime', label: 'Starts', kind: 'datetime', required: true },
      { key: 'endTime', label: 'Ends', kind: 'datetime', required: true },
      { key: 'description', label: 'Description', kind: 'multiline' },
    ],
    summary: (a) => ({
      title: String(a.title ?? ''),
      sub: [time(a.startTime), a.speakerName].filter(Boolean).join('  ·  '),
    }),
  },
  speakers: {
    noun: 'speaker',
    fields: [
      { key: 'name', label: 'Name', required: true, placeholder: 'Jane Smith' },
      { key: 'designation', label: 'Designation', placeholder: 'CTO' },
      { key: 'company', label: 'Company', placeholder: 'TechCorp' },
      { key: 'linkedinUrl', label: 'LinkedIn URL', kind: 'url' },
      { key: 'avatarUrl', label: 'Photo URL', kind: 'url' },
      { key: 'bio', label: 'Bio', kind: 'multiline' },
    ],
    summary: (s) => ({ title: String(s.name ?? ''), sub: [s.designation, s.company].filter(Boolean).join('  ·  ') }),
  },
  prizes: {
    noun: 'prize',
    fields: [
      { key: 'title', label: 'Title', required: true, placeholder: 'Grand prize' },
      { key: 'rank', label: 'Rank or label', placeholder: '1st prize' },
      { key: 'value', label: 'Value', placeholder: '₹50,000' },
      { key: 'description', label: 'Description', kind: 'multiline' },
    ],
    summary: (p) => ({
      title: [p.rank, p.title].filter(Boolean).join('  ·  '),
      sub: [p.value, p.description].filter(Boolean).join('  ·  '),
    }),
  },
  contacts: {
    noun: 'contact',
    fields: [
      { key: 'name', label: 'Name', required: true, placeholder: 'Priya Sharma' },
      { key: 'role', label: 'Role', placeholder: 'Event coordinator' },
      { key: 'email', label: 'Email', kind: 'email' },
      { key: 'phone', label: 'Phone', kind: 'phone' },
    ],
    summary: (c) => ({
      title: [c.name, c.role].filter(Boolean).join('  ·  '),
      sub: [c.email, c.phone].filter(Boolean).join('  ·  '),
    }),
  },
  faqs: {
    noun: 'FAQ',
    fields: [
      { key: 'question', label: 'Question', required: true, placeholder: 'Is there parking?' },
      { key: 'answer', label: 'Answer', kind: 'multiline', required: true },
    ],
    summary: (f) => ({ title: String(f.question ?? ''), sub: String(f.answer ?? '') }),
  },
};

/** Blank strings are dropped, so optional fields are left unset rather than "". */
function clean(values: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    const t = v.trim();
    if (t) out[k] = t;
  }
  return out;
}

export const createContentItem = (eventId: string, section: ContentSection, values: Record<string, string>) =>
  call<ContentItem>(`/events/${eventId}/${section}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clean(values)),
  });

export const updateContentItem = (eventId: string, section: ContentSection, id: string, values: Record<string, string>) =>
  call<ContentItem>(`/events/${eventId}/${section}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clean(values)),
  });

export const deleteContentItem = (eventId: string, section: ContentSection, id: string) =>
  call<unknown>(`/events/${eventId}/${section}/${id}`, { method: 'DELETE' });
