import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* The text is the latest published version of the "privacy" legal
   document (I2, edited in Apex); this file keeps the route and metadata.
   Privacy Policy. Written against what the product actually collects and
   where it goes (verified in backend, space app and mobile code), and
   structured for India's Digital Personal Data Protection Act, 2023, the
   DPDP Rules, 2025 and the IT (Reasonable Security Practices) Rules, 2011.
   Have counsel review before publishing changes. */

export const metadata: Metadata = withSocial({
  title: "Privacy Policy",
  description:
    "What personal data Unifesto collects, why, who it is shared with, where it is stored, how long it is kept, and your rights under India's Digital Personal Data Protection Act, 2023.",
  alternates: { canonical: "/privacy" },
}, { title: "Unifesto Privacy Policy" });

export const revalidate = 300;

export default function PrivacyPage() {
  return (
    <LegalDocPage
      slug="privacy"
      title="Privacy Policy"
      path="/privacy"
      lines={["Privacy Policy"]}
      lede="What we collect, why, who sees it, where it lives, how long we keep it, and the rights you have over it. In plain language."
    />
  );
}
