import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* The text is the latest published version of the "data-rights" legal
   document (K7, edited in Apex); this file keeps the route and metadata.
   Data Principal Rights Policy: how Unifesto handles requests under
   sections 11–14 of the DPDP Act, 2023 and the DPDP Rules, 2025. The
   "how to file" side lives at /privacy-requests. */

export const metadata: Metadata = withSocial({
  title: "Data Principal Rights Policy",
  description:
    "Your rights over your personal data under India's DPDP Act, 2023, and how Unifesto verifies, handles and answers each request.",
  alternates: { canonical: "/data-rights" },
}, { title: "Unifesto Data Principal Rights Policy" });

export const revalidate = 300;
export const dynamic = "force-static"; // prerendered, CDN-cacheable: lib/cached-pages.ts

export default function DataRightsPage() {
  return (
    <LegalDocPage
      slug="data-rights"
      title="Data Principal Rights Policy"
      path="/data-rights"
      lines={["Your data", "rights"]}
      lede="What you can ask us to do with your personal data, who can ask, and how quickly we answer."
    />
  );
}
