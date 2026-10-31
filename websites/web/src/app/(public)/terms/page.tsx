import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* The text is the latest published version of the "terms" legal
   document (I2, edited in Apex); this file keeps the route and metadata.
   Terms of Service. Matches how the product works (sign-in methods,
   Spaces and roles, Razorpay payments, payouts, refunds, stays, sponsors)
   and is structured for the IT Act, 2000 and IT (Intermediary Guidelines)
   Rules, 2021, the Consumer Protection (E-Commerce) Rules, 2020 and the
   Indian Contract Act, 1872. Have counsel review before publishing. */

export const metadata: Metadata = withSocial({
  title: "Terms of Service",
  description:
    "The terms for using Unifesto as an attendee or organiser: accounts, Spaces, tickets and payments, payouts, refunds, stays, acceptable use, liability and disputes.",
  alternates: { canonical: "/terms" },
}, { title: "Unifesto Terms of Service" });

export const revalidate = 300;
export const dynamic = "force-static"; // prerendered, CDN-cacheable: lib/cached-pages.ts

export default function TermsPage() {
  return (
    <LegalDocPage
      slug="terms"
      title="Terms of Service"
      path="/terms"
      lines={["Terms of Service"]}
      lede="The agreement between you and Unifesto, for attendees and organisers alike."
    />
  );
}
