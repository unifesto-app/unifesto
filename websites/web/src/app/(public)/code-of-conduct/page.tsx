import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* The text is the latest published version of the "code-of-conduct" legal
   document (K7, edited in Apex); this file keeps the route and metadata.
   Code of Conduct for everyone on Unifesto and at events run through it:
   attendees, organisers and their crew, hackathon judges, mentors and
   volunteers, and sponsors. Enforcement mirrors what the product can do
   (report sheet in the app, content reports reviewed in Apex). */

export const metadata: Metadata = withSocial({
  title: "Code of Conduct",
  description:
    "How attendees, organisers, judges, mentors, volunteers and sponsors are expected to behave on Unifesto and at events run through it.",
  alternates: { canonical: "/code-of-conduct" },
}, { title: "Unifesto Code of Conduct" });

export const revalidate = 300;
export const dynamic = "force-static"; // prerendered, CDN-cacheable: lib/cached-pages.ts

export default function CodeOfConductPage() {
  return (
    <LegalDocPage
      slug="code-of-conduct"
      title="Code of Conduct"
      path="/code-of-conduct"
      lines={["Code of Conduct"]}
      lede="Simple rules for attendees, organisers, judges, mentors, volunteers and sponsors, online and at the venue."
    />
  );
}
