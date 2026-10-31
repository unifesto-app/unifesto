import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* Sponsor and Partner Terms (I1). The text is the latest published version of the
   "sponsor-terms" legal document, edited in Apex; 404 until one is published. */

export const metadata: Metadata = withSocial({
  title: "Sponsor and Partner Terms",
  description: "The terms for sponsors and partners on Unifesto, and how attendee leads may be used.",
  alternates: { canonical: "/sponsor-terms" },
}, { title: "Unifesto Sponsor and Partner Terms" });

export const revalidate = 300;
export const dynamic = "force-static"; // prerendered, CDN-cacheable: lib/cached-pages.ts

export default function SponsorTermsPage() {
  return (
    <LegalDocPage
      slug="sponsor-terms"
      title="Sponsor and Partner Terms"
      path="/sponsor-terms"
      lines={["Sponsor and", "partner terms"]}
      lede="The terms for sponsors and partners on Unifesto, and how attendee leads may be used."
    />
  );
}
