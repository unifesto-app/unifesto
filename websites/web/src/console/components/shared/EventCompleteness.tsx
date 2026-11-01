import Link from "next/link";
import { CheckCircle, Circle, ArrowRight } from "@unifesto/unicon/react";
import type { Event } from "@/console/lib/api/events-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/console/components/ui/card";
import { cn } from "@/console/lib/utils/cn";

/**
 * A single line on the setup checklist: what it is, whether it's filled in, and
 * where to go to fix it.
 */
interface ChecklistItem {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  href: string;
}

/**
 * Compute the two tiers of the setup checklist from a hydrated event.
 *
 * `required` is what publishing checks (Q22, decision E; the backend's
 * `publishMustHaves` has the same rules): a cover, a venue or joining link,
 * and one way to register. They drive the percentage. `enhancements` make the
 * page richer but never block, so they sit below and don't drag the score down.
 */
function buildChecklist(event: Event, base: string) {
  const has = (v?: string | null) => !!v && v.trim().length > 0;
  const venue = has(event.venueName) || has(event.venueAddress);
  const link = has(event.onlineUrl);
  const location = {
    IN_PERSON: { label: "Venue", hint: "Add the venue so people can find you.", done: venue },
    ONLINE: { label: "Joining link", hint: "Add where people join online.", done: link },
    HYBRID: { label: "Venue or joining link", hint: "Add the venue, the joining link, or both.", done: venue || link },
  }[event.type];

  const isPaid = event.registrationType === "TICKETED" || event.registrationType === "MIXED";
  // A festival hub takes registrations on its sub-events, not on itself.
  const canRegister = (event.ticketTypes?.length ?? 0) > 0 || (event.childEvents?.length ?? 0) > 0;
  const registrationHref = isPaid ? `${base}/tickets` : `${base}/rsvps`;

  const required: ChecklistItem[] = [
    {
      key: "cover",
      label: "Cover image",
      hint: "The first thing people see, in the app and on the web.",
      done: has(event.coverImageUrl),
      href: `${base}/edit`,
    },
    { key: "location", ...location, href: `${base}/edit` },
    {
      key: "registration",
      label: isPaid ? "A ticket" : "An RSVP option",
      hint: isPaid ? "Add at least one ticket to sell." : "Set up how people RSVP.",
      done: canRegister,
      href: registrationHref,
    },
  ];

  const enhancements: ChecklistItem[] = [
    {
      key: "description",
      label: "Description",
      hint: "Tell attendees what to expect.",
      done: has(event.description),
      href: `${base}/edit`,
    },
    {
      key: "category",
      label: "Category & tags",
      hint: "Help people discover the event.",
      done: has(event.category) || (event.tags?.length ?? 0) > 0,
      href: `${base}/edit`,
    },
    {
      key: "agenda",
      label: "Agenda",
      hint: "Lay out the schedule of talks or sessions.",
      done: (event.agenda?.length ?? 0) > 0,
      href: `${base}/content`,
    },
    {
      key: "speakers",
      label: "Speakers & guests",
      hint: "Introduce who's presenting.",
      done: (event.speakers?.length ?? 0) > 0,
      href: `${base}/content`,
    },
    {
      key: "prizes",
      label: "Prizes & takeaways",
      hint: "What attendees can win or walk away with.",
      done: (event.prizes?.length ?? 0) > 0,
      href: `${base}/content`,
    },
    {
      key: "faqs",
      label: "FAQs",
      hint: "Answer the questions people always ask.",
      done: (event.faqs?.length ?? 0) > 0,
      href: `${base}/content`,
    },
    {
      key: "contacts",
      label: "Contacts",
      hint: "Point attendees to a person for help.",
      done: (event.contacts?.length ?? 0) > 0,
      href: `${base}/content`,
    },
  ];

  return { required, enhancements };
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      {item.done ? (
        <CheckCircle
          className="h-5 w-5 flex-shrink-0 text-success"
          weight="fill"
        />
      ) : (
        <Circle className="h-5 w-5 flex-shrink-0 text-muted-foreground/50" />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium",
            item.done ? "text-muted-foreground line-through" : "text-foreground"
          )}
        >
          {item.label}
        </p>
        {!item.done && (
          <p className="text-xs text-muted-foreground">{item.hint}</p>
        )}
      </div>
      {!item.done && (
        <Link
          href={item.href}
          className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Add
          <ArrowRight className="h-3 w-3" weight="bold" />
        </Link>
      )}
    </li>
  );
}

/**
 * The "Event setup" card shown at the top of an event's overview. Scores what
 * publishing requires (cover, venue or link, registration) as a percentage and
 * lists the richer, optional content below. Read-only — every row links out to
 * the tab where the organiser actually fills it in.
 */
export function EventCompleteness({ event }: { event: Event }) {
  const base = `/console/events/${event.id}`;
  const { required, enhancements } = buildChecklist(event, base);

  const doneCount = required.filter((i) => i.done).length;
  const total = required.length;
  const pct = Math.round((doneCount / total) * 100);
  const complete = doneCount === total;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Event setup</CardTitle>
            <CardDescription>
              {event.status !== "DRAFT"
                ? `${doneCount} of ${total} required done.`
                : complete
                  ? "Ready to publish."
                  : `${doneCount} of ${total} done. Add the rest to publish.`}
            </CardDescription>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "text-2xl font-semibold tabular-nums",
                complete ? "text-success" : "text-foreground"
              )}
            >
              {pct}%
            </span>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 ease-standard",
              complete ? "bg-success" : "bg-primary"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <p className="text-eyebrow mb-1">Required to publish</p>
        <ul className="divide-y divide-border">
          {required.map((item) => (
            <ChecklistRow key={item.key} item={item} />
          ))}
        </ul>

        {/* Enhancements — optional, don't gate the score */}
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-eyebrow mb-1">Make it richer (optional)</p>
          <ul className="divide-y divide-border">
            {enhancements.map((item) => (
              <ChecklistRow key={item.key} item={item} />
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
