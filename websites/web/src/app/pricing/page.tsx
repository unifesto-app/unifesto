import { gradientText, brandGradient } from "@/lib/styles";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Pricing | Unifesto",
  description: "Simple, transparent pricing for attendees and event organizers. Free for organizers to create events. No hidden fees.",
  keywords: ["unifesto pricing", "event pricing", "free event hosting", "event costs", "organizer pricing"],
  openGraph: {
    title: "Pricing | Unifesto",
    description: "Simple, transparent pricing for attendees and event organizers.",
    type: "website",
    url: "https://www.unifesto.app/pricing",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing | Unifesto",
    description: "Simple, transparent pricing for attendees and event organizers.",
    site: "@unifestoapp",
  },
};

const plans = [
  {
    name: "Free",
    price: "₹0",
    period: "forever",
    description: "Perfect for student clubs running occasional events.",
    featured: false,
    cta: "Get Started Free",
    ctaHref: "/auth",
    features: [
      "Up to 3 events/month",
      "Unlimited free RSVPs",
      "Basic event page",
      "QR check-in (up to 100 attendees)",
      "Email support",
    ],
    missing: ["Ticketing & payments", "Advanced analytics", "Priority listing", "Custom branding"],
  },
  {
    name: "Pro",
    price: "₹999",
    period: "per event",
    description: "For serious organisers who need the full toolkit.",
    featured: true,
    cta: "Start with Pro",
    ctaHref: "/auth",
    features: [
      "Unlimited events",
      "Paid ticketing & RSVP",
      "QR check-in (unlimited attendees)",
      "Real-time analytics dashboard",
      "Priority event listing",
      "Custom event branding",
      "Attendee export (CSV)",
      "Dedicated support",
    ],
    missing: [],
  },
  {
    name: "Institution",
    price: "Custom",
    period: "per semester",
    description: "For institutions and organisations running multiple events at scale.",
    featured: false,
    cta: "Contact Us",
    ctaHref: "mailto:support@unifesto.app",
    features: [
      "Everything in Pro",
      "Multi-organiser accounts",
      "Organisation-wide event calendar",
      "API access",
      "White-label option",
      "Dedicated account manager",
      "SLA support",
    ],
    missing: [],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-black overflow-x-hidden">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-36 pb-16 px-6 text-center overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(52,145,255,0.08) 0%, transparent 70%)" }}
          aria-hidden="true"
        />
        <div className="relative z-10 max-w-2xl mx-auto">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase mb-4" style={gradientText}>Pricing</p>
          <h1 className="text-4xl md:text-6xl font-extrabold text-white leading-tight mb-4">
            Simple,<br />
            <span style={gradientText}>transparent pricing.</span>
          </h1>
          <p className="text-slate-400 text-sm md:text-lg leading-relaxed">
            No hidden fees. No surprises. Start free and scale when you&apos;re ready.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section id="plans" className="px-6 pb-24 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-6 md:p-8 flex flex-col transition-all duration-300 ${plan.featured
                ? "border-0 shadow-[0_0_60px_rgba(37,99,235,0.2)]"
                : "border border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              style={plan.featured ? { background: "linear-gradient(160deg, #0d1b3e 0%, #0a1628 100%)", border: "1px solid rgba(52,145,255,0.3)" } : {}}
            >
              {plan.featured && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold text-black px-4 py-1 rounded-full uppercase tracking-widest"
                  style={{ background: brandGradient }}
                >
                  Most Popular
                </div>
              )}

              <div className="mb-6">
                <h2 className="text-base font-bold text-white mb-1">{plan.name}</h2>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-4xl font-black text-white">{plan.price}</span>
                  <span className="text-slate-500 text-sm mb-1">/{plan.period}</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{plan.description}</p>
              </div>

              <a
                href={plan.ctaHref}
                className="w-full rounded-full py-3 text-sm font-semibold text-center transition-all duration-300 mb-6 block hover:-translate-y-0.5"
                style={
                  plan.featured
                    ? { background: brandGradient, color: "#000" }
                    : { border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }
                }
              >
                {plan.cta}
              </a>

              <ul className="flex flex-col gap-2.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "#3491ff" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-xs text-slate-300">{f}</span>
                  </li>
                ))}
                {plan.missing.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 opacity-30">
                    <svg className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="text-xs text-slate-500">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* FAQ note */}
        <p className="text-center text-xs text-slate-600 mt-10">
          All prices exclusive of taxes. For custom quotes, reach out to{" "}
          <a href="mailto:support@unifesto.app" className="text-slate-400 hover:text-white transition-colors">
            support@unifesto.app
          </a>
        </p>
      </section>

      <Footer />
    </main>
  );
}
