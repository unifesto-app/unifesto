import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* Encore programme terms (Encore was Unifesto Orbit until 14 Nov 2026). The text is the
   latest published version of the "orbit-terms" legal document, edited in Apex; 404 until
   one is published. The title here stays generic until a version under the Encore name is
   published, so the page never claims a title the document doesn't carry. */

export const metadata: Metadata = withSocial({
  title: "Encore programme terms",
  description: "The terms for Encore Leads in Unifesto Encore, the campus programme.",
  alternates: { canonical: "/encore/terms" },
}, { title: "Encore programme terms" });

export const revalidate = 300;
export const dynamic = "force-static"; // prerendered, CDN-cacheable: lib/cached-pages.ts

export default function EncoreTermsPage() {
  return (
    <LegalDocPage
      slug="orbit-terms"
      title="Encore programme terms"
      path="/encore/terms"
      lines={["Encore", "programme terms"]}
      lede="The terms for Encore Leads in Unifesto Encore, the campus programme. Encore was called Unifesto Orbit until November 2026, and the terms below use that name until their next version."
    />
  );
}
