import type { Metadata } from "next";
import Link from "next/link";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* The text is the latest published version of the "privacy-notice" legal
   document (K7, edited in Apex); this file keeps the route and metadata.
   Privacy Notice: the short, standalone notice DPDP Rules, 2025 (Rule 3)
   ask for at the point of consent. It itemises data and purposes, and
   says how to withdraw consent, exercise rights and complain to the
   Board. Must stay consistent with /privacy, which has the detail. */

export const metadata: Metadata = withSocial({
  title: "Privacy Notice",
  description:
    "A short notice of the personal data Unifesto asks for, why, and how to withdraw consent, exercise your rights or complain, under India's DPDP Act, 2023.",
  alternates: { canonical: "/privacy-notice" },
}, { title: "Unifesto Privacy Notice" });

export const revalidate = 300;
export const dynamic = "force-static"; // prerendered, CDN-cacheable: lib/cached-pages.ts

export default function PrivacyNoticePage() {
  return (
    <LegalDocPage
      slug="privacy-notice"
      title="Privacy Notice"
      path="/privacy-notice"
      lines={["Privacy Notice"]}
      lede={<>The one-page version: what we ask for, why, and how to take it back. The <Link href="/privacy" className="link-draw text-paper">Privacy Policy</Link> has the detail.</>}
    />
  );
}
