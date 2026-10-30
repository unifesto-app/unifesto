import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarPlus,
  Article,
  InstagramLogo,
  LinkedinLogo,
  PlayCircle,
  WhatsappLogo,
} from "@unifesto/unicon/react";
import CosmicBackdrop from "@/components/site/CosmicBackdrop";
import StoreBadges from "@/components/site/StoreBadges";
import { getPosts } from "@/lib/api/blog";
import { SITE, SOCIAL } from "@/lib/site";
import { withSocial } from "@/lib/seo";

/* Link-in-bio (P1). Every profile bio points here with its own
   ?utm_source=<channel>, so analytics shows which bio sends visitors.
   Not indexed: it only repeats links that live elsewhere on the site. */
export const metadata: Metadata = withSocial(
  {
    alternates: { canonical: "/links" },
    title: "Links",
    robots: { index: false, follow: true },
    description: "Start a Space, get the app, read the latest guide, and find Unifesto everywhere.",
  },
  { title: "Unifesto links", description: "Start a Space, get the app, read the latest guide." },
);

export const revalidate = 3600;

export default async function LinksPage() {
  const latest = (await getPosts())[0];

  const primary = [
    { href: "/request-space", label: "Start your Space", sub: "Tickets, check-in and payouts", icon: CalendarPlus },
    latest && { href: `/blog/${latest.slug}`, label: latest.title, sub: "Latest guide", icon: Article },
    { href: SOCIAL.youtube, label: "Watch on YouTube", sub: "Guides for organisers", icon: PlayCircle },
  ].filter(Boolean) as { href: string; label: string; sub: string; icon?: typeof Article }[];

  const social = [
    { href: SOCIAL.instagram, label: "Instagram", icon: InstagramLogo },
    { href: SOCIAL.linkedin, label: "LinkedIn", icon: LinkedinLogo },
    { href: SOCIAL.youtube, label: "YouTube", icon: PlayCircle },
    { href: `https://wa.me/${SITE.whatsapp}`, label: "WhatsApp support", icon: WhatsappLogo },
  ];

  return (
    <main className="surface-night relative min-h-screen overflow-x-hidden">
      <CosmicBackdrop variant="page" />
      <div className="relative mx-auto flex w-full max-w-md flex-col items-center px-4 pb-16 pt-16">
        <Link href="/" aria-label="Unifesto home">
          <Image src="/logos/unifesto-icon.png" alt="" width={72} height={72} className="rounded-2xl" priority />
        </Link>
        <h1 className="mt-5 font-display text-2xl text-paper" style={{ letterSpacing: "-0.03em" }}>
          Unifesto
        </h1>
        <p className="mt-2 text-center text-[15px] text-paper/65">{SITE.tagline} Events for clubs, fests and hackathons in India.</p>

        <ul className="mt-9 flex w-full flex-col gap-4">
          {primary.map(({ href, label, sub, icon: Icon }) => (
            <li key={href}>
              <a
                href={href}
                className="flex items-center gap-4 rounded-2xl bg-paper/[0.07] px-5 py-4 text-paper transition-colors hover:bg-paper/[0.12] active:scale-[0.99]"
              >
                {Icon && <Icon className="h-6 w-6 shrink-0 text-paper/80" weight="bold" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{label}</span>
                  <span className="block truncate text-sm text-paper/55">{sub}</span>
                </span>
                <ArrowUpRight className="h-5 w-5 shrink-0 text-paper/50" weight="bold" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-sm text-paper/55">Your passes live in the app</p>
        <StoreBadges className="mt-3 justify-center" />

        <ul className="mt-10 flex gap-6">
          {social.map(({ href, label, icon: Icon }) => (
            <li key={label}>
              <a href={href} aria-label={label} className="text-paper/70 transition-colors hover:text-paper">
                <Icon className="h-7 w-7" weight="bold" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
