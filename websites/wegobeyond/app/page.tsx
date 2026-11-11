import Link from "next/link";
import Reveal from "@/components/Reveal";
import ContactForm from "@/components/ContactForm";
import RegisterNow from "@/components/RegisterNow";
import { getContent } from "@/lib/site";

// What we run, written as formats, never as dated events (those live on Unifesto).
// Read as one statement: each format word in rust, then the rest of its sentence.
const FORMATS = [
  { name: "Workshops", rest: "where you leave with something built." },
  { name: "Meetups", rest: "that put founders, developers and creators in one room." },
  { name: "Hackathons", rest: "with teams, mentors and a deadline." },
];

const PARTNER_KINDS = [
  { name: "Sponsors", body: "Put your brand in front of the people who build." },
  { name: "Venues", body: "Fill your space with founders, developers and creators." },
  { name: "Communities", body: "Bring your members and see every sign-up on Unifesto." },
];

// The crew band's words. Each copy repeats them twice so one copy is wider than
// any screen, and the track holds two copies so the loop is seamless.
const CREW_BAND = ["Volunteer", "Speaker", "Mentor", "Host", "Volunteer", "Speaker", "Mentor", "Host"];

const RELEASE_DATE = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

// No cards anywhere: sections are separated by space and one hairline divider.
const DIVIDER = "border-t-[1.5px] border-line";

export default async function Home() {
  const c = await getContent();
  const partnerMail = `mailto:${c.partnersInbox}?subject=${encodeURIComponent("Partnering with WeGoBeyond")}`;

  return (
    <>
      {/* ==================== HERO ==================== */}
      {/* The title sits in the exact middle of the screen (not of the area under the
          header); the line + the two ways in are pinned to the bottom. */}
      <section id="top" className="wrap relative flex min-h-[max(calc(100svh-88px),600px)] flex-col justify-end pb-12">
        {/* Positioned by this wrapper; the Reveal inside animates its own transform. The
            insets match .wrap's side padding, and the 88px is the sticky header. */}
        <div className="@container absolute inset-x-[clamp(16px,5vw,64px)] top-[calc(50svh-88px)] -translate-y-1/2 text-center">
          <Reveal trigger="load">
            {/* One word can't wrap, so it's sized to the column (container units), capped at the display size.
                -0.1em is optical centring: DM Sans's ink for this word sits 0.097em below the
                centre of its line box (measured with canvas measureText), so the box is lifted
                to put the letters you see in the middle, at every size. */}
            <h1 className="relative -top-[0.1em] whitespace-nowrap text-[length:min(164px,16cqi)]">
              wego<span className="text-rust">beyond.</span>
            </h1>
          </Reveal>
        </div>
        <Reveal
          trigger="load"
          stagger
          delay={0.15}
          className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between"
        >
          <p data-reveal-item className="lead max-w-[30ch] text-silver">
            {c.heroLead}
          </p>
          <div data-reveal-item className="flex flex-wrap gap-3">
            <a href="#partners" className="btn btn-rust">
              Partner with us
            </a>
            <a href="#register" className="btn btn-ghost">
              Register now
            </a>
          </div>
        </Reveal>
      </section>

      {/* ==================== WHAT WE RUN ==================== */}
      {/* Its own device: an editorial statement. Heading left, one big sentence right,
          the three formats picked out in rust. No grid, no rows. */}
      <section id="what" className="wrap scroll-mt-28 pt-28">
        <div className={`grid gap-8 ${DIVIDER} pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16`}>
          <Reveal>
            <h2>What we run.</h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="statement">
              {FORMATS.map((f) => (
                <span key={f.name}>
                  <strong className="font-bold text-rust">{f.name}</strong> {f.rest}{" "}
                </span>
              ))}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ==================== INITIATIVES ==================== */}
      {/* No cards: a grid of six, each opened by a divider. */}
      <section id="initiatives" className="wrap scroll-mt-28 pt-28">
        <div className={`${DIVIDER} pt-12`}>
          <Reveal>
            <h2>Initiatives.</h2>
          </Reveal>
          <Reveal stagger className="mt-12 grid gap-x-10 md:grid-cols-2 lg:grid-cols-3">
            {c.initiatives.map((it) => (
              <Link
                key={it.slug}
                href={`/initiative/${it.slug}`}
                data-reveal-item
                className={`group flex flex-col ${DIVIDER} pb-12 pt-6`}
              >
                <span className="small text-rust">{it.note}</span>
                <h3 className="mt-4 transition-colors group-hover:text-rust">{it.name}</h3>
                <span className="mt-2.5 max-w-[34ch] text-silver">{it.body}</span>
                <span className="small mt-6">
                  View <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-1">→</span>
                </span>
              </Link>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ==================== REGISTER NOW (live from Unifesto) ==================== */}
      <RegisterNow />

      {/* ==================== MOMENTS & MEMORIES ==================== */}
      {/* Its own device: a masonry wall of photos. Hidden until the first photo is added in Apex. */}
      {c.gallery.length > 0 && (
        <section id="moments" className="wrap scroll-mt-28 pt-28">
          <div className={`${DIVIDER} pt-12`}>
            <Reveal>
              <h2>Moments &amp; memories.</h2>
            </Reveal>
            <Reveal stagger className="mt-12 columns-2 gap-3.5 lg:columns-3">
              {c.gallery.map((p) => (
                <figure key={p.src} data-reveal-item className="mb-3.5 break-inside-avoid">
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploads or any https link; sizes unknown */}
                  <img src={p.src} alt={p.alt} loading="lazy" decoding="async" className="w-full rounded-[20px]" />
                  {p.caption && <figcaption className="caption mt-2 text-silver">{p.caption}</figcaption>}
                </figure>
              ))}
            </Reveal>
          </div>
        </section>
      )}

      {/* ==================== PARTNERS ==================== */}
      {/* The one panel on the page (user's call): paper, so partners stand out. */}
      <section id="partners" className="wrap scroll-mt-28 pt-28">
        <Reveal className="grid items-end gap-10 rounded-[36px] bg-paper p-7 text-ink sm:p-12 lg:grid-cols-[1.15fr_1fr] lg:p-16">
          <div>
            <h2>Bring your brand, venue or community.</h2>
            <p className="lead mt-5 max-w-[38ch] text-stone">
              Every attendee signs up on Unifesto, so you see exactly who came.
            </p>
            <a href={partnerMail} className="btn btn-ink mt-8">
              Partner with us
            </a>
          </div>
          <ul>
            {PARTNER_KINDS.map((k, i) => (
              <li key={k.name} className="border-t-[1.5px] border-ink/12 py-5">
                <div className="title flex items-baseline justify-between gap-6">
                  <span>{k.name}</span>
                  <span className="text-rust tabular-nums">0{i + 1}</span>
                </div>
                <p className="mt-1 text-stone">{k.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* ==================== CREW ==================== */}
      {/* The people themselves are on /crew; this section invites people to join them. */}
      {/* Neither card nor divider: a full-bleed band of moving type that is itself the link. */}
      <section id="crew" className="scroll-mt-28 overflow-hidden pt-28">
        {/* A quiet, centred label for the band: the h3 step of the type scale. */}
        <Reveal className="wrap text-center">
          <h2 className="h3">Join the crew.</h2>
        </Reveal>
        <Link href="/volunteer" aria-label="Join the crew" className="marquee mt-12 block py-2">
          <span className="marquee-track" aria-hidden="true">
            {[0, 1].map((copy) => (
              <span key={copy} className="flex shrink-0 items-center">
                {CREW_BAND.map((word, i) => (
                  <span key={i} className="flex items-center">
                    <span className="marquee-word">{word}</span>
                    <span className="marquee-word px-[0.35em] text-rust">·</span>
                  </span>
                ))}
              </span>
            ))}
          </span>
        </Link>
        <Reveal className="wrap mt-12 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <p className="lead max-w-[44ch] text-silver">
            Tell us how you&rsquo;d like to help and we&rsquo;ll reach out when there&rsquo;s a room
            to run.
          </p>
          <div className="flex shrink-0 flex-wrap gap-3 self-start md:self-auto">
            <Link href="/volunteer" className="btn btn-paper">
              Join the crew →
            </Link>
            <Link href="/crew" className="btn btn-ghost">
              Meet the crew
            </Link>
            {/* Another way to help: any amount, paid on Razorpay. */}
            {c.support && (
              <a href={c.support} target="_blank" rel="noreferrer noopener" className="btn btn-ghost">
                Back the community ↗
              </a>
            )}
          </div>
        </Reveal>
      </section>

      {/* ==================== RELEASES & PRESS ==================== */}
      {/* Its own device: a vertical timeline (rust dots on one line) beside the press kit. */}
      <section id="press" className="wrap scroll-mt-28 pt-28">
        <div className={`${DIVIDER} pt-12`}>
          <Reveal>
            <h2>Releases &amp; press.</h2>
          </Reveal>
          <div className="mt-12 grid gap-16 lg:grid-cols-[1.4fr_1fr] lg:gap-20">
            <Reveal stagger as="ol" className="border-l-[1.5px] border-line">
              {c.releases.map((r) => (
                <li key={r.date + r.title} data-reveal-item className="relative pb-12 pl-8 last:pb-0">
                  <span aria-hidden="true" className="absolute -left-[7px] top-[5px] h-3 w-3 rounded-full bg-rust" />
                  <time dateTime={r.date} className="small text-rust">
                    {RELEASE_DATE.format(new Date(r.date))}
                  </time>
                  <h3 className="title mt-3">{r.title}</h3>
                  <p className="mt-2 max-w-[56ch] text-silver">{r.body}</p>
                </li>
              ))}
            </Reveal>
            <Reveal delay={0.06} className="flex flex-col gap-12">
              <div>
                <h3 className="title">About WeGoBeyond</h3>
                <p className="caption mt-1 text-silver">Boilerplate, free to use as written.</p>
                <p className="lead mt-5">{c.boilerplate}</p>
              </div>
              <div>
                <h3 className="title">Press contact</h3>
                <p className="caption mt-1 text-silver">Interviews, photos and facts.</p>
                <a
                  href={`mailto:${c.pressEmail}?subject=${encodeURIComponent("Press enquiry")}`}
                  className="title mt-4 inline-block text-rust transition-colors hover:text-paper"
                >
                  {c.pressEmail}
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ==================== CONTACT ==================== */}
      {/* Its own device: the addresses themselves, big, as the links. */}
      <section id="contact" className="wrap scroll-mt-28 pb-28 pt-28">
        <div className={`grid gap-14 ${DIVIDER} pt-12 md:grid-cols-2 md:gap-20`}>
          <Reveal>
            <h2>Say hello.</h2>
            <ul className="mt-12 space-y-8">
              {c.contacts.map((c) => (
                <li key={c.addr}>
                  <p className="caption text-silver">{c.role}</p>
                  <a
                    href={`mailto:${c.addr}`}
                    className="h3 mt-1 inline-block [overflow-wrap:anywhere] transition-colors hover:text-rust"
                  >
                    {c.addr}
                  </a>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.06} className="rounded-[28px] bg-ink-2 p-7 sm:p-10">
            <ContactForm inbox={c.supportInbox} />
          </Reveal>
        </div>
      </section>
    </>
  );
}
