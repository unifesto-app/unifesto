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

// Duplicate for seamless loop
const marqueeItems = [...partners, ...partners];

const Node = () => (
  <span
    className="mx-7 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60 select-none"
    aria-hidden="true"
  />
);

export default function MarqueeBar() {
  return (
    <section
      aria-label="Clubs and cells hosting on Unifesto"
      className="relative overflow-hidden border-y border-white/10 bg-canvas py-6"
    >
      {/* Edge fades keep the strip inside the dark page theme */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-black to-transparent"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-black to-transparent"
        aria-hidden="true"
      />

      {/* Scrolling content */}
      <div className="flex overflow-hidden" style={{ willChange: "transform" }}>
        <div className="animate-marquee flex items-center">
          {marqueeItems.map((partner, i) => (
            <span key={`${partner}-${i}`} className="inline-flex items-center">
              <span className="whitespace-nowrap text-lg font-semibold tracking-tight text-slate-300 md:text-xl">
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
