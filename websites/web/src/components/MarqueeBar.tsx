const partners = [
  "Malla Reddy University",
  "Innovation & Entrepreneurship Cell",
  "StudLYF",
  "GDGon Campus MRUH",
  "Marquee Film Club",
  "MUN Club MRUH",
  "Alan Turing Club",
  "AWS Cloud Clubs MRUH",
];

// Second copy only closes the loop; hidden from assistive tech.
const marqueeItems = [...partners, ...partners];

const Node = () => (
  <span className="mx-7 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary select-none" aria-hidden="true" />
);

/* A paper band between the dark hero and the dark platform section. The
   ticker is time-based motion, so it runs linear (see .animate-marquee). */
export default function MarqueeBar() {
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
        <div className="animate-marquee flex items-center">
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
