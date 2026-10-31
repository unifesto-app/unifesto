import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* The text is the latest published version of the "refund" legal
   document (I2, edited in Apex); this file keeps the route and metadata.
   Refund and Cancellation Policy. Mirrors the product exactly: refund
   requests are reviewed by the event's organiser, then decided by
   Unifesto; approved refunds return the ticket's base amount to the
   original payment method through Razorpay; the processing ("app") fee
   is not refundable. Required disclosure under the Consumer Protection
   (E-Commerce) Rules, 2020. */

export const metadata: Metadata = withSocial({
  title: "Refund and Cancellation Policy",
  description:
    "How refunds work on Unifesto: requesting a refund in the app, organiser review and Unifesto approval, what is refunded, timelines, cancelled events and stays.",
  alternates: { canonical: "/refund" },
}, { title: "Unifesto Refund and Cancellation Policy" });

export const revalidate = 300;
export const dynamic = "force-static"; // prerendered, CDN-cacheable: lib/cached-pages.ts

export default function RefundPage() {
  return (
    <LegalDocPage
      slug="refund"
      title="Refund and Cancellation Policy"
      path="/refund"
      lines={["Refunds and", "cancellations"]}
      lede="How to ask for a refund, who reviews it, what comes back to you, and how long it takes."
    />
  );
}
