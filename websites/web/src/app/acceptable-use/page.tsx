import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* Acceptable Use Policy (I1). The text is the latest published version of the
   "acceptable-use" legal document, edited in Apex; 404 until one is published. */

export const metadata: Metadata = withSocial({
  title: "Acceptable Use Policy",
  description: "What you can and cannot post or do on Unifesto, and what happens when the rules are broken.",
  alternates: { canonical: "/acceptable-use" },
}, { title: "Unifesto Acceptable Use Policy" });

export const revalidate = 300;

export default function AcceptableUsePage() {
  return (
    <LegalDocPage
      slug="acceptable-use"
      title="Acceptable Use Policy"
      path="/acceptable-use"
      lines={["Acceptable use"]}
      lede="What you can and cannot post or do on Unifesto, and what happens when the rules are broken."
    />
  );
}
