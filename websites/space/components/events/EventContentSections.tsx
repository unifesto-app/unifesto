"use client";

import {
  CalendarBlank,
  UsersThree,
  Trophy,
  Phone,
  Question,
} from "@phosphor-icons/react";
import { SectionEditor, type FieldDef } from "./SectionEditor";
import {
  createAgenda,
  updateAgenda,
  deleteAgenda,
  createSpeaker,
  updateSpeaker,
  deleteSpeaker,
  createPrize,
  updatePrize,
  deletePrize,
  createContact,
  updateContact,
  deleteContact,
  createFaq,
  updateFaq,
  deleteFaq,
  type EventAgenda,
  type EventSpeaker,
  type EventPrize,
  type EventContact,
  type EventFaq,
} from "@/lib/api/events-api";

/** Convert ISO string to `datetime-local` value (YYYY-MM-DDTHH:mm). */
function toLocalDatetime(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Convert a `datetime-local` value into an ISO string (empty stays empty). */
function toIso(local?: string): string | undefined {
  if (!local) return undefined;
  return new Date(local).toISOString();
}

interface EventContentSectionsProps {
  eventId: string;
  agenda: EventAgenda[];
  speakers: EventSpeaker[];
  prizes: EventPrize[];
  contacts: EventContact[];
  faqs: EventFaq[];
  disabled?: boolean;
}

/**
 * The additional-info editors shown on the event edit page: Agenda,
 * Speakers/Guests, Prizes/Takeaways, Contact, and FAQs. Each section persists
 * independently via its own endpoints (it is not part of the main event form).
 */
export function EventContentSections({
  eventId,
  agenda,
  speakers,
  prizes,
  contacts,
  faqs,
  disabled = false,
}: EventContentSectionsProps) {
  // --- Agenda ---
  const agendaFields: FieldDef[] = [
    { key: "title", label: "Title", required: true, placeholder: "Opening keynote" },
    { key: "speakerName", label: "Speaker", colSpan: 1, placeholder: "Optional" },
    { key: "startTime", label: "Starts", type: "datetime", required: true, colSpan: 1 },
    { key: "endTime", label: "Ends", type: "datetime", required: true, colSpan: 1 },
    { key: "description", label: "Description", type: "textarea" },
  ];

  // --- Speakers / Guests ---
  const speakerFields: FieldDef[] = [
    { key: "name", label: "Name", required: true, colSpan: 1, placeholder: "Jane Smith" },
    { key: "designation", label: "Designation", colSpan: 1, placeholder: "CTO" },
    { key: "company", label: "Company", colSpan: 1, placeholder: "TechCorp" },
    { key: "linkedinUrl", label: "LinkedIn URL", type: "url", colSpan: 1 },
    { key: "avatarUrl", label: "Photo URL", type: "url" },
    { key: "bio", label: "Bio", type: "textarea" },
  ];

  // --- Prizes / Takeaways ---
  const prizeFields: FieldDef[] = [
    { key: "title", label: "Title", required: true, colSpan: 1, placeholder: "Grand Prize" },
    { key: "rank", label: "Rank / Label", colSpan: 1, placeholder: "1st Prize" },
    { key: "value", label: "Value", colSpan: 1, placeholder: "₹50,000" },
    { key: "description", label: "Description", type: "textarea" },
  ];

  // --- Contact ---
  const contactFields: FieldDef[] = [
    { key: "name", label: "Name", required: true, colSpan: 1, placeholder: "Priya Sharma" },
    { key: "role", label: "Role", colSpan: 1, placeholder: "Event Coordinator" },
    { key: "email", label: "Email", type: "email", colSpan: 1 },
    { key: "phone", label: "Phone", type: "tel", colSpan: 1 },
  ];

  // --- FAQs ---
  const faqFields: FieldDef[] = [
    { key: "question", label: "Question", required: true, placeholder: "Is there parking?" },
    { key: "answer", label: "Answer", type: "textarea", required: true },
  ];

  return (
    <div className="space-y-6">
      <SectionEditor<EventAgenda>
        title="Agenda"
        description="Schedule of talks and sessions."
        icon={<CalendarBlank className="h-4 w-4" />}
        addLabel="Add item"
        emptyText="No agenda items yet."
        items={agenda}
        fields={agendaFields}
        disabled={disabled}
        getId={(a) => a.id}
        renderSummary={(a) => (
          <div>
            <p className="font-medium">{a.title}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(a.startTime).toLocaleString()} –{" "}
              {new Date(a.endTime).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {a.speakerName ? ` · ${a.speakerName}` : ""}
            </p>
          </div>
        )}
        toForm={(a) => ({
          title: a?.title ?? "",
          speakerName: a?.speakerName ?? "",
          startTime: toLocalDatetime(a?.startTime),
          endTime: toLocalDatetime(a?.endTime),
          description: a?.description ?? "",
        })}
        onCreate={async (v) => {
          const { data, error } = await createAgenda(eventId, {
            title: v.title.trim(),
            speakerName: v.speakerName?.trim() || undefined,
            startTime: toIso(v.startTime)!,
            endTime: toIso(v.endTime)!,
            description: v.description?.trim() || undefined,
          });
          return { item: data, error: error?.message ?? null };
        }}
        onUpdate={async (id, v) => {
          const { data, error } = await updateAgenda(eventId, id, {
            title: v.title.trim(),
            speakerName: v.speakerName?.trim() || undefined,
            startTime: toIso(v.startTime),
            endTime: toIso(v.endTime),
            description: v.description?.trim() || undefined,
          });
          return { item: data, error: error?.message ?? null };
        }}
        onDelete={async (id) => {
          const { error } = await deleteAgenda(eventId, id);
          return { error: error?.message ?? null };
        }}
      />

      <SectionEditor<EventSpeaker>
        title="Speakers & Guests"
        description="Featured speakers, guests, and panelists."
        icon={<UsersThree className="h-4 w-4" />}
        addLabel="Add speaker"
        emptyText="No speakers or guests yet."
        items={speakers}
        fields={speakerFields}
        disabled={disabled}
        getId={(s) => s.id}
        renderSummary={(s) => (
          <div>
            <p className="font-medium">{s.name}</p>
            {(s.designation || s.company) && (
              <p className="text-xs text-muted-foreground">
                {[s.designation, s.company].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        )}
        toForm={(s) => ({
          name: s?.name ?? "",
          designation: s?.designation ?? "",
          company: s?.company ?? "",
          linkedinUrl: s?.linkedinUrl ?? "",
          avatarUrl: s?.avatarUrl ?? "",
          bio: s?.bio ?? "",
        })}
        onCreate={async (v) => {
          const { data, error } = await createSpeaker(eventId, {
            name: v.name.trim(),
            designation: v.designation?.trim() || undefined,
            company: v.company?.trim() || undefined,
            linkedinUrl: v.linkedinUrl?.trim() || undefined,
            avatarUrl: v.avatarUrl?.trim() || undefined,
            bio: v.bio?.trim() || undefined,
          });
          return { item: data, error: error?.message ?? null };
        }}
        onUpdate={async (id, v) => {
          const { data, error } = await updateSpeaker(eventId, id, {
            name: v.name.trim(),
            designation: v.designation?.trim() || undefined,
            company: v.company?.trim() || undefined,
            linkedinUrl: v.linkedinUrl?.trim() || undefined,
            avatarUrl: v.avatarUrl?.trim() || undefined,
            bio: v.bio?.trim() || undefined,
          });
          return { item: data, error: error?.message ?? null };
        }}
        onDelete={async (id) => {
          const { error } = await deleteSpeaker(eventId, id);
          return { error: error?.message ?? null };
        }}
      />

      <SectionEditor<EventPrize>
        title="Prizes & Takeaways"
        description="What attendees win or walk away with."
        icon={<Trophy className="h-4 w-4" />}
        addLabel="Add prize"
        emptyText="No prizes or takeaways yet."
        items={prizes}
        fields={prizeFields}
        disabled={disabled}
        getId={(p) => p.id}
        renderSummary={(p) => (
          <div>
            <p className="font-medium">
              {p.rank ? `${p.rank} · ` : ""}
              {p.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {[p.value, p.description].filter(Boolean).join(" — ")}
            </p>
          </div>
        )}
        toForm={(p) => ({
          title: p?.title ?? "",
          rank: p?.rank ?? "",
          value: p?.value ?? "",
          description: p?.description ?? "",
        })}
        onCreate={async (v) => {
          const { data, error } = await createPrize(eventId, {
            title: v.title.trim(),
            rank: v.rank?.trim() || undefined,
            value: v.value?.trim() || undefined,
            description: v.description?.trim() || undefined,
          });
          return { item: data, error: error?.message ?? null };
        }}
        onUpdate={async (id, v) => {
          const { data, error } = await updatePrize(eventId, id, {
            title: v.title.trim(),
            rank: v.rank?.trim() || undefined,
            value: v.value?.trim() || undefined,
            description: v.description?.trim() || undefined,
          });
          return { item: data, error: error?.message ?? null };
        }}
        onDelete={async (id) => {
          const { error } = await deletePrize(eventId, id);
          return { error: error?.message ?? null };
        }}
      />

      <SectionEditor<EventContact>
        title="Contact"
        description="Points of contact for attendee questions."
        icon={<Phone className="h-4 w-4" />}
        addLabel="Add contact"
        emptyText="No contacts yet."
        items={contacts}
        fields={contactFields}
        disabled={disabled}
        getId={(c) => c.id}
        renderSummary={(c) => (
          <div>
            <p className="font-medium">
              {c.name}
              {c.role ? ` · ${c.role}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {[c.email, c.phone].filter(Boolean).join(" · ")}
            </p>
          </div>
        )}
        toForm={(c) => ({
          name: c?.name ?? "",
          role: c?.role ?? "",
          email: c?.email ?? "",
          phone: c?.phone ?? "",
        })}
        onCreate={async (v) => {
          const { data, error } = await createContact(eventId, {
            name: v.name.trim(),
            role: v.role?.trim() || undefined,
            email: v.email?.trim() || undefined,
            phone: v.phone?.trim() || undefined,
          });
          return { item: data, error: error?.message ?? null };
        }}
        onUpdate={async (id, v) => {
          const { data, error } = await updateContact(eventId, id, {
            name: v.name.trim(),
            role: v.role?.trim() || undefined,
            email: v.email?.trim() || undefined,
            phone: v.phone?.trim() || undefined,
          });
          return { item: data, error: error?.message ?? null };
        }}
        onDelete={async (id) => {
          const { error } = await deleteContact(eventId, id);
          return { error: error?.message ?? null };
        }}
      />

      <SectionEditor<EventFaq>
        title="FAQs"
        description="Frequently asked questions."
        icon={<Question className="h-4 w-4" />}
        addLabel="Add FAQ"
        emptyText="No FAQs yet."
        items={faqs}
        fields={faqFields}
        disabled={disabled}
        getId={(f) => f.id}
        renderSummary={(f) => (
          <div>
            <p className="font-medium">{f.question}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {f.answer}
            </p>
          </div>
        )}
        toForm={(f) => ({
          question: f?.question ?? "",
          answer: f?.answer ?? "",
        })}
        onCreate={async (v) => {
          const { data, error } = await createFaq(eventId, {
            question: v.question.trim(),
            answer: v.answer.trim(),
          });
          return { item: data, error: error?.message ?? null };
        }}
        onUpdate={async (id, v) => {
          const { data, error } = await updateFaq(eventId, id, {
            question: v.question.trim(),
            answer: v.answer.trim(),
          });
          return { item: data, error: error?.message ?? null };
        }}
        onDelete={async (id) => {
          const { error } = await deleteFaq(eventId, id);
          return { error: error?.message ?? null };
        }}
      />
    </div>
  );
}
