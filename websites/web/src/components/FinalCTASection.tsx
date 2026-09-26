export default function FinalCTASection() {
  return (
    <section id="final-cta" aria-labelledby="cta-heading" className="relative bg-canvas py-24 md:py-32 px-6 overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(52,145,255,0.08) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />
      {/* Top accent line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px pointer-events-none" style={{ background: "linear-gradient(90deg, transparent, #3491ff, transparent)" }} aria-hidden="true" />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <h2 id="cta-heading" className="text-4xl md:text-6xl font-extrabold text-white leading-[1.05] [text-wrap:balance] mb-5">
          Your next event starts here.
        </h2>
        <p className="text-slate-300 text-base md:text-lg max-w-lg mx-auto mb-10 leading-relaxed">
          Whether you&apos;re looking for something to do or building the next big event, Unifesto is your platform.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            id="final-cta-explore"
            href="/events"
            className="w-full sm:w-auto rounded-full bg-primary px-8 py-3.5 text-sm font-semibold text-black text-center transition-transform duration-200 hover:-translate-y-0.5"
          >
            Discover events
          </a>
          <a
            id="final-cta-create"
            href="/#host"
            className="w-full sm:w-auto rounded-full border border-white/15 px-8 py-3.5 text-sm font-semibold text-white text-center transition-colors duration-200 hover:border-primary/50 hover:text-primary"
          >
            Host an event
          </a>
        </div>
      </div>
    </section>
  );
}
