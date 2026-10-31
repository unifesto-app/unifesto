import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* Organiser Agreement (I1). The text is the latest published version of the
   "organiser-agreement" legal document, edited in Apex; 404 until one is published. */

export const metadata: Metadata = withSocial({
  title: "Organiser Agreement",
  description: "The terms for running a Space on Unifesto: what organisers are responsible for, fees, payouts, refunds and attendee data.",
  alternates: { canonical: "/organiser-agreement" },
}, { title: "Unifesto Organiser Agreement" });

export const revalidate = 300;
export const dynamic = "force-static"; // prerendered, CDN-cacheable: lib/cached-pages.ts

export default function OrganiserAgreementPage() {
  return (
    <LegalDocPage
      slug="organiser-agreement"
      title="Organiser Agreement"
      path="/organiser-agreement"
      lines={["Organiser", "agreement"]}
      lede="The terms for running a Space on Unifesto: what organisers are responsible for, fees, payouts, refunds and attendee data."
    />
  );
}
