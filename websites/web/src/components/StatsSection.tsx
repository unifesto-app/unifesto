import { gradientText } from "@/lib/styles";

const stats = [
  {
    value: "10,000+",
    label: "Members",
    description: "Active users",
  },
  {
    value: "500+",
    label: "Events",
    description: "Hosted successfully",
  },
  {
    value: "50+",
    label: "Spaces",
    description: "Clubs & communities",
  },
  {
    value: "95%",
    label: "Satisfaction",
    description: "Organizer rating",
  },
];

export default function StatsSection() {
  return (
    <section className="relative bg-black py-20 md:py-28 px-6 border-t border-white/5">
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(52,145,255,0.05) 0%, transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-3" style={gradientText}>
            Our Impact
          </p>
          <h2 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">
            Trusted by the<br />
            <span style={gradientText}>Unifesto community.</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="text-center p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300"
            >
              <p
                className="text-4xl md:text-5xl font-extrabold mb-2"
                style={gradientText}
              >
                {stat.value}
              </p>
              <p className="text-base font-semibold text-white mb-1">{stat.label}</p>
              <p className="text-xs text-slate-500">{stat.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
