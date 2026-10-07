const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

// Fallback when the API is unreachable, so the band never renders empty.
const FALLBACK = [
  "Malla Reddy University",
  "Innovation & Entrepreneurship Cell",
  "StudLYF",
  "GDGon Campus MRUH",
  "Marquee Film Club",
  "MUN Club MRUH",
  "Alan Turing Club",
  "AWS Cloud Clubs MRUH",
];

// Every ACTIVE public space, re-read at most every 10 minutes (ISR).
async function activeSpaceNames(): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/spaces?status=ACTIVE&limit=100`, { next: { revalidate: 600 } });
    if (!res.ok) return FALLBACK;
    const { spaces } = (await res.json()) as { spaces?: { name: string }[] };
    const names = (spaces ?? []).map((s) => s.name.trim()).filter(Boolean);
    return names.length ? names : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

const Node = () => (
  <span className="mx-7 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary select-none" aria-hidden="true" />
);

/* A paper band between the dark hero and the dark platform section. The
   ticker is time-based motion, so it runs linear (see .animate-marquee). */
export default async function MarqueeBar() {
  const partners = await activeSpaceNames();
  // Second copy only closes the loop; hidden from assistive tech.
  const marqueeItems = [...partners, ...partners];
  return (
    <section
      aria-label="Clubs and cells hosting on Unifesto"
      data-surface="light"
      className="surface-paper relative overflow-hidden py-7"
    >
      <p className="sr-only">Clubs and cells hosting on Unifesto</p>
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-[var(--paper-bg)] to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-[var(--paper-bg)] to-transparent" aria-hidden="true" />

      <div className="flex overflow-hidden">
        {/* Keep the original pace (22s for 8 names) as the list grows. */}
        <div className="animate-marquee flex items-center" style={{ animationDuration: `${partners.length * 2.75}s` }}>
          {marqueeItems.map((partner, i) => (
            <span key={`${partner}-${i}`} className="inline-flex items-center" aria-hidden={i >= partners.length || undefined}>
              <span className="whitespace-nowrap font-display text-sm text-ink/70 md:text-base">
                {partner}
              </span>
              <Node />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
