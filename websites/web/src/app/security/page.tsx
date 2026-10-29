import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* The text is the latest published version of the "security" legal
   document (K7, edited in Apex); this file keeps the route and metadata.
   Responsible Disclosure Policy. /.well-known/security.txt points here.
   No paid bounty is promised; change the "rewards" section if one starts. */

export const metadata: Metadata = withSocial({
  title: "Responsible Disclosure Policy",
  description:
    "How to report a security vulnerability in Unifesto, what is in scope, and our commitment to researchers who report in good faith.",
  alternates: { canonical: "/security" },
}, { title: "Unifesto Responsible Disclosure Policy" });

export const revalidate = 300;

export default function SecurityPage() {
  return (
    <LegalDocPage
      slug="security"
      title="Responsible Disclosure Policy"
      path="/security"
      lines={["Responsible", "disclosure"]}
      lede="Found a security problem? Tell us privately first. Here is how, what is in scope, and what we promise in return."
    />
  );
}
