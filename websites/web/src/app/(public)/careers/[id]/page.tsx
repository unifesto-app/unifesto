import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { withSocial } from "@/lib/seo";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import { HeroSky } from "@/components/site/CosmicBackdrop";
import { getRole, type Career } from "@/lib/api/careers";
import { SITE } from "@/lib/site";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const role = await getRole((await params).id);
  if (!role) return { title: "Role not found", robots: { index: false } };
  return withSocial({
    title: { absolute: `${role.title} | Careers at Unifesto` },
    description: `${role.type}, ${role.location}. ${role.description}`.slice(0, 160),
    alternates: { canonical: `/careers/${role.id}` },
  }, { type: "website" });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const list = (title: string, items: string[]) =>
  items.length ? `<h3>${esc(title)}</h3><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";

const EMPLOYMENT: Record<string, string> = {
  "full-time": "FULL_TIME",
  "part-time": "PART_TIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
  temporary: "TEMPORARY",
};

/* schema.org JobPosting (K2) for Google's job results. One per role page,
   since Google ignores postings on list pages. */
function jobLd(role: Career) {
  const remote = /remote/i.test(role.location);
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: role.title,
    // Google wants HTML here.
    description:
      `<p>${esc(role.description)}</p>` +
      list("What you'll do", role.responsibilities) +
      list("What we're looking for", role.requirements) +
      list("Benefits", role.benefits),
    datePosted: role.created_at,
    employmentType: EMPLOYMENT[role.type.trim().toLowerCase()] ?? "OTHER",
    hiringOrganization: { "@type": "Organization", name: SITE.name, sameAs: SITE.url, logo: SITE.logo },
    identifier: { "@type": "PropertyValue", name: SITE.name, value: role.id },
    directApply: true,
    url: `${SITE.url}/careers/${role.id}`,
    ...(remote
      ? { jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: "India" } }
      : {
          jobLocation: {
            "@type": "Place",
            address: { "@type": "PostalAddress", addressLocality: role.location, addressCountry: "IN" },
          },
        }),
  };
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-paper">{title}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-paper/80">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </section>
  );
}

export default async function CareerPage({ params }: Props) {
  const role = await getRole((await params).id);
  if (!role) notFound();

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd
        data={[
          jobLd(role),
          breadcrumbLd([
            { name: "Careers", path: "/careers" },
            { name: role.title, path: `/careers/${role.id}` },
          ]),
        ]}
      />
      <Navbar />

      <header id="page-hero" className="surface-night relative overflow-hidden px-5 pb-12 pt-32 sm:px-8 md:pt-40">
        <HeroSky targetId="page-hero" />
        <div className="relative mx-auto max-w-3xl">
          <Link href="/careers" className="link-draw text-sm font-medium text-paper/65 transition-colors duration-150 hover:text-paper">
            ← Careers
          </Link>
          <p className="mt-8 text-sm font-semibold text-primary">{role.department}</p>
          <h1
            className="mt-3 font-display text-[clamp(2rem,4.6vw,3.25rem)] font-bold leading-[1.05] text-paper [text-wrap:balance]"
            style={{ letterSpacing: "-0.035em" }}
          >
            {role.title}
          </h1>
          <p className="mt-5 text-sm text-paper/65">
            {[role.location, role.type, role.experience_level, role.salary_range].filter(Boolean).join(" · ")}
          </p>
          <Link href={`/careers?apply=${role.id}`} className="btn btn-lg btn-primary mt-8">
            Apply for this role
          </Link>
        </div>
      </header>

      <article className="px-5 pb-24 pt-4 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="whitespace-pre-line text-base leading-relaxed text-paper/80">{role.description}</p>
          <Section title="What you'll do" items={role.responsibilities} />
          <Section title="What we're looking for" items={role.requirements} />
          <Section title="Benefits" items={role.benefits} />
        </div>
      </article>

      <Footer />
    </main>
  );
}
