import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/site/PageHero";
import Section from "@/components/site/Section";
import FeatureRow from "@/components/site/FeatureRow";
import FaqList from "@/components/site/FaqList";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import StoreBadges from "@/components/site/StoreBadges";
import { FeedScreen, PassScreen, ExtrasScreen } from "@/components/visuals/AppScreens";
import { RubricVisual } from "@/components/visuals/Hackathon";
import { ScanVisual } from "@/components/visuals/Product";
import { APP_FEATURES, FAQ_APP, SITE } from "@/lib/site";

export const metadata: Metadata = withSocial({
  title: "The Unifesto app: discover events, register, check in",
  description:
    "Free on iOS and Android. Find events near you, register or buy tickets in a few taps, keep every QR pass in one place, book stays, join live sessions and collect your certificates.",
  alternates: { canonical: "/app" },
}, { title: "The Unifesto app", description: "Discover events, register in a few taps and walk in with your pass. Free on iOS and Android." });

const appLd = {
  "@context": "https://schema.org",
  "@type": "MobileApplication",
  name: "Unifesto: Discover Events",
  operatingSystem: "iOS, Android",
  applicationCategory: "LifestyleApplication",
  description: "Discover events, register, carry QR passes, book stays, join live sessions and collect certificates.",
  offers: { "@type": "Offer", price: 0, priceCurrency: "INR" },
  installUrl: [SITE.appStore, SITE.playStore],
  publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
};

/* Discover shows the feed; the pass row shows the moment it is used, at
   the gate; the hero already carries the pass itself. */
const SCREENS: Record<string, React.ReactNode> = { discover: <FeedScreen />, pass: <ScanVisual />, more: <ExtrasScreen /> };

export default function AppPage() {
  // Register folds into the pass row: one story from tap to gate.
  const features = APP_FEATURES.filter((f) => f.id !== "register");
  const register = APP_FEATURES.find((f) => f.id === "register")!;
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd data={[appLd, breadcrumbLd([{ name: "Home", path: "/" }, { name: "App", path: "/app" }])]} />
      <Navbar />

      <PageHero
        lines={["Every event,", "in your pocket."]}
        accentFrom={1}
        lede="The Unifesto app is free on iOS and Android. Find what is on, register in a few taps, and walk in with the pass already on your phone."
        actions={<StoreBadges />}
        aside={<PassScreen />}
      />

      <Section pad="tight">
        {features.map((f, i) => (
          <FeatureRow
            key={f.id}
            as="h2"
            id={f.id}
            title={f.title}
            lede={f.id === "pass" ? `${register.body} ${f.body}` : f.body}
            visual={SCREENS[f.id]}
            flip={i % 2 === 0}
          />
        ))}
      </Section>

      <Section surface="paper" aria-labelledby="team-heading">
        <FeatureRow
          as="h2"
          id="team-heading"
          title="In a hackathon? Your team lives here too."
          lede="See your problem statement, manage your team, submit your project, raise a help desk query and follow results. Judges score teams from the same app."
          visual={<RubricVisual />}
        />
      </Section>

      <Section width="mid" innerClassName="text-center">
        <h2 data-reveal="clip" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.15] text-paper">
          Get Unifesto.
        </h2>
        <p data-reveal="blur" className="mx-auto mt-4 max-w-[44ch] text-[15px] font-light leading-relaxed text-paper/65">
          Free, with no ads. Your passes, tickets and certificates stay with your account.
        </p>
        <div data-reveal="rise" className="mt-8 flex justify-center">
          <StoreBadges />
        </div>
      </Section>

      <FaqList faqs={FAQ_APP} />
      <Footer />
    </main>
  );
}
