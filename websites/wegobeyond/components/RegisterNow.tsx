import Reveal from "@/components/Reveal";
import { LINKS, UNIFESTO, getContent } from "@/lib/site";
import { formatWhen, getUpcomingEvents, type UpcomingEvent } from "@/lib/events";

const priceLabel = (p: UpcomingEvent["price"]) =>
  p === null ? null : p === "Free" ? "Free" : `From ₹${p.toLocaleString("en-IN")}`;

// Upcoming events, read live from Unifesto. No cards: one row per event between
// dividers; registration itself happens on the Unifesto event page.
// `match` narrows the list to one initiative's editions (see lib/initiatives.ts).
export default async function RegisterNow({ match }: { match?: string[] } = {}) {
  const [all, { socials }] = await Promise.all([getUpcomingEvents(), getContent()]);
  const instagram = socials.find((s) => s.brand === "wegobeyond")?.accounts[0]?.href;
  const events =
    all && match
      ? all.filter((e) => match.some((m) => `${e.title} ${e.slug}`.toLowerCase().includes(m)))
      : all;

  return (
    <section id="register" className="wrap scroll-mt-28 pt-28">
      <div className="border-t-[1.5px] border-line pt-12">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <h2>Register now.</h2>
          {events && events.length > 0 && (
            <a href={LINKS.whatsOn} target="_blank" rel="noreferrer noopener" className="small transition-colors hover:text-rust">
              All events on Unifesto ↗
            </a>
          )}
        </Reveal>

        {events && events.length > 0 ? (
          <Reveal stagger as="ul" className="mt-10">
            {events.map((e) => (
              <li key={e.slug} data-reveal-item>
                <a
                  href={UNIFESTO.eventUrl(e.slug)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group grid gap-2 border-b-[1.5px] border-line py-6 md:grid-cols-[220px_1fr_auto] md:items-baseline md:gap-8"
                >
                  <span className="small text-rust">{formatWhen(e)}</span>
                  <span>
                    <span className="title block transition-colors group-hover:text-rust">{e.title}</span>
                    {e.place && <span className="mt-1 block text-silver">{e.place}</span>}
                  </span>
                  <span className="small flex items-center gap-4 md:justify-end">
                    {priceLabel(e.price) && <span className="font-normal text-silver">{priceLabel(e.price)}</span>}
                    <span>Register →</span>
                  </span>
                </a>
              </li>
            ))}
          </Reveal>
        ) : (
          // Nothing open, or Unifesto unreachable: say which, and send people where dates appear first.
          <Reveal className="mt-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <p className="lead max-w-[40ch] text-silver">
              {events === null
                ? "We couldn’t load events just now. Every one of them is on Unifesto."
                : "Nothing is open for registration right now. New dates go up on Unifesto first."}
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={LINKS.whatsOn} target="_blank" rel="noreferrer noopener" className="btn btn-paper">
                See all on Unifesto ↗
              </a>
              {instagram && (
                <a href={instagram} target="_blank" rel="noreferrer noopener" className="btn btn-ghost">
                  Follow on Instagram
                </a>
              )}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
