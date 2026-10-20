import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* Unifesto Orbit Lead Programme Terms. The text is the latest published version of the
   "orbit-terms" legal document, edited in Apex; 404 until one is published. */

export const metadata: Metadata = withSocial({
  title: "Unifesto Orbit Lead Programme Terms",
  description: "The terms for Orbit Leads in Unifesto Orbit, the campus programme.",
  alternates: { canonical: "/orbit/terms" },
}, { title: "Unifesto Orbit Lead Programme Terms" });

export const revalidate = 300;

export default function OrbitTermsPage() {
  return (
    <LegalDocPage
      slug="orbit-terms"
      title="Unifesto Orbit Lead Programme Terms"
      path="/orbit/terms"
      lines={["Orbit Lead", "programme terms"]}
      lede="The terms for Orbit Leads in Unifesto Orbit, the campus programme."
    />
  );
}
