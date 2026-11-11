import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import OrbitMap, { cityCount } from "@/components/OrbitMap";
import { getContent, pageMetadata } from "@/lib/site";
import {
  MAP_MIN_APPLICATIONS,
  ORBIT,
  ORBIT_FAQ,
  ORBIT_KITS,
  ORBIT_RULES,
  ORBIT_STEPS,
  ORBIT_TIERS,
  getOrbitMap,
} from "@/lib/orbit";

export const metadata: Metadata = pageMetadata(
  "Unifesto Orbit",
  "One Orbit Lead per campus helps every club on campus run its events on Unifesto. Remote, flexible, no fixed hours. Rewards are recognition, not cash.",
  "/orbit",
  true
);

// The map's numbers come live from Unifesto; the rest of the page is static.
export const revalidate = 300;

const DIVIDER = "border-t-[1.5px] border-line";
const OUT = { target: "_blank", rel: "noreferrer noopener" } as const;

export default async function OrbitPage() {
  const [map, { community }] = await Promise.all([getOrbitMap(), getContent()]);
  // Applications from colleges with no known city count in totals only, so cities can be empty.
  const showMap = map && map.totals.applications >= MAP_MIN_APPLICATIONS && map.cities.length > 0;

  return (
    <>
      {/* ==================== HERO ==================== */}
      <section className="wrap pt-16 lg:pt-24">
        <Reveal trigger="load" stagger>
          <h1 data-reveal-item>
            Unifesto <span className="text-rust">Orbit.</span>
          </h1>
          <div data-reveal-item className="mt-12 grid items-end gap-10 lg:grid-cols-[1fr_auto]">
            <p className="statement max-w-[30ch]">
              One student per campus. You <span className="font-bold text-rust">map</span> every club, get each one{" "}
              <span className="font-bold text-rust">onto Unifesto</span>, and help it{" "}
              <span className="font-bold text-rust">publish its first event</span>.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={ORBIT.apply} {...OUT} className="btn btn-rust">
                Apply on Unifesto ↗
              </a>
              <a href={ORBIT.terms} {...OUT} className="btn btn-ghost">
                Programme terms ↗
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ==================== THE JOB ==================== */}
      {/* Numbered rows beside the plain facts of who can apply. */}
      <section className="wrap pt-28">
        <div className={`grid gap-14 ${DIVIDER} pt-12 lg:grid-cols-[1.4fr_1fr] lg:gap-20`}>
          <Reveal>
            <h2>The job.</h2>
            <ol className="mt-10">
              {ORBIT_STEPS.map((s, i) => (
                <li key={s.title} className={`flex gap-6 ${DIVIDER} py-5`}>
                  <span className="title w-8 shrink-0 text-rust tabular-nums">0{i + 1}</span>
                  <span>
                    <span className="title block">{s.title}</span>
                    <span className="mt-1 block text-silver">{s.body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-silver">One more: introduce your fest committee to Unifesto.</p>
          </Reveal>
          <Reveal delay={0.06}>
            <h2>Who it&rsquo;s for.</h2>
            <p className="lead mt-10 max-w-[36ch]">
              You&rsquo;re 18 or older, you study on the campus you&rsquo;d lead, and you&rsquo;re already active in a
              club or fest team. You represent Unifesto, not your college.
            </p>
            <h3 className="title mt-12">Your first 30 days</h3>
            <p className="mt-3 max-w-[40ch] text-silver">
              {/* Names the WeGoBeyond community only once it exists (its link is set in Apex). */}
              {community
                ? "On day one you’re added to the Orbit Leads group in the WeGoBeyond WhatsApp community. Then onboard 2 clubs."
                : "Join the Orbit Leads WhatsApp community on day one and onboard 2 clubs."} After that there&rsquo;s no end
              date: you stay as long as you&rsquo;re active. Exam breaks are fine; tell your Program Lead first. Remote,
              with no fixed hours.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ==================== WHAT YOU EARN ==================== */}
      {/* Four giant numbers: the bar for each tier, split by vertical dividers. */}
      <section className="wrap pt-28">
        <div className={`${DIVIDER} pt-12`}>
          <Reveal>
            <h2>What you earn.</h2>
            <p className="lead mt-5 max-w-[52ch] text-silver">
              An active club is one that has published an event on Unifesto. Rewards are recognition, not cash.
            </p>
          </Reveal>
          <Reveal stagger as="ol" className="mt-14 grid grid-cols-2 gap-y-14 lg:grid-cols-4">
            {ORBIT_TIERS.map((t, i) => (
              <li
                key={t.name}
                data-reveal-item
                className={`pr-5 ${i % 2 ? "border-l-[1.5px] border-line pl-5" : ""} ${i === 2 ? "lg:border-l-[1.5px] lg:border-line lg:pl-5" : ""}`}
              >
                <p className={`h1 tabular-nums ${t.name === "Gold" ? "text-rust" : ""}`}>{t.count}</p>
                <h3 className="title mt-6">{t.name}</h3>
                <p className="caption mt-1 text-silver">{t.bar}</p>
                <ul className="mt-5 space-y-1.5">
                  {t.rewards.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </li>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ==================== GROUND RULES ==================== */}
      {/* The page's one panel: paper, the loudest block. */}
      <section className="wrap pt-28">
        <Reveal className="grid gap-10 rounded-[36px] bg-paper p-7 text-ink sm:p-12 lg:grid-cols-[1fr_1.3fr] lg:p-16">
          <div>
            <h2>Ground rules.</h2>
            <p className="lead mt-5 max-w-[30ch] text-stone">Breaking one can cost you the seat.</p>
          </div>
          <ol>
            {ORBIT_RULES.map((r, i) => (
              <li key={r} className="title flex gap-6 border-t-[1.5px] border-ink/12 py-5">
                <span className="w-6 shrink-0 text-rust tabular-nums">{i + 1}</span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>

      {/* ==================== IN THE BOX ==================== */}
      {/* Each kit as one line of big type, items split by rust dots. */}
      <section className="wrap pt-28">
        <div className={`${DIVIDER} pt-12`}>
          <Reveal>
            <h2>In the box.</h2>
          </Reveal>
          <div className="mt-12 space-y-14">
            {ORBIT_KITS.map((k) => (
              <Reveal key={k.name}>
                <h3 className="small text-rust">{k.name}</h3>
                <p className="caption mt-1 text-silver">{k.when}</p>
                <p className="statement mt-5 max-w-[40ch]">
                  {k.items.map((item, i) => (
                    <span key={item}>
                      {i > 0 && (
                        <span aria-hidden="true" className="text-rust">
                          {" "}
                          ·{" "}
                        </span>
                      )}
                      {item}
                    </span>
                  ))}
                </p>
              </Reveal>
            ))}
            <Reveal>
              <h3 className="small text-rust">Every quarter</h3>
              <p className="mt-3 max-w-[56ch]">
                Every active Lead gets a sticker and lanyard pack. Silver and Gold also get that quarter&rsquo;s
                limited-edition hoodie, a new design each time. Shipped after March, June, September and December.
              </p>
              <p className="caption mt-3 text-silver">
                Active means you&rsquo;ve passed your first 30 days and added a club or event in the last 60 days. Kit
                contents may vary.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ==================== QUESTIONS ==================== */}
      {/* Question and answer pairs in two open columns. */}
      <section className="wrap pt-28">
        <div className={`${DIVIDER} pt-12`}>
          <Reveal>
            <h2>Questions.</h2>
          </Reveal>
          <Reveal stagger as="dl" className="mt-12 grid gap-x-20 gap-y-10 md:grid-cols-2">
            {ORBIT_FAQ.map((f) => (
              <div key={f.q} data-reveal-item>
                <dt className="title">{f.q}</dt>
                <dd className="mt-2 max-w-[48ch] text-silver">{f.a}</dd>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ==================== ACROSS INDIA ==================== */}
      {/* Live from Unifesto; shown once there are enough applications to be worth a map. */}
      {showMap && (
        <section className="wrap pt-28">
          <div className={`grid items-start gap-14 ${DIVIDER} pt-12 lg:grid-cols-2 lg:gap-20`}>
            <Reveal>
              <h2>Orbit across India.</h2>
              <div className="mt-10 flex gap-10">
                {(
                  [
                    ["application", map.totals.applications],
                    ["city", map.totals.cities],
                    ["college", map.totals.colleges],
                  ] as const
                ).map(([label, n]) => (
                  <p key={label}>
                    <span className="num block">{n}</span>
                    <span className="caption mt-1 block text-silver">
                      {n === 1 ? label : label === "city" ? "cities" : `${label}s`}
                    </span>
                  </p>
                ))}
              </div>
              <ul className="mt-10">
                {[...map.cities]
                  .sort((a, b) => cityCount(b) - cityCount(a))
                  .map((c) => (
                    <li key={c.city} className={`title flex justify-between gap-6 ${DIVIDER} py-3`}>
                      <span>{c.city}</span>
                      <span className="text-rust tabular-nums">{cityCount(c)}</span>
                    </li>
                  ))}
              </ul>
            </Reveal>
            <Reveal delay={0.06}>
              <OrbitMap cities={map.cities} />
            </Reveal>
          </div>
        </section>
      )}

      {/* ==================== APPLY ==================== */}
      {/* The close, centred. Applying needs a Unifesto account, so it happens there. */}
      <section className="wrap pb-28 pt-28">
        <Reveal className="flex flex-col items-center text-center">
          <h2>Lead your campus.</h2>
          <p className="lead mt-6 max-w-[48ch] text-silver">
            Apply in about ten minutes on Unifesto. Tell us your campus, the clubs you&rsquo;re part of and the active
            clubs on your campus. We verify your email and phone, and the Program Lead gets back to you.
          </p>
          <a href={ORBIT.apply} {...OUT} className="btn btn-rust mt-10">
            Apply on Unifesto ↗
          </a>
          <p className="caption mt-8 text-silver">
            Questions?{" "}
            <a href={`mailto:${ORBIT.inbox}`} className="text-paper underline underline-offset-4 hover:text-rust">
              {ORBIT.inbox}
            </a>{" "}
            ·{" "}
            <a href={ORBIT.terms} {...OUT} className="text-paper underline underline-offset-4 hover:text-rust">
              Programme terms ↗
            </a>
          </p>
        </Reveal>
      </section>
    </>
  );
}
