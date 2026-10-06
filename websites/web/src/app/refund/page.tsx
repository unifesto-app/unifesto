import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import LegalPage, { type LegalSection } from "@/components/site/LegalPage";
import { LEGAL } from "@/lib/legal";

/* Refund and Cancellation Policy. Mirrors the product exactly: refund
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

const mail = (e: string) => <a href={`mailto:${e}`}>{e}</a>;

const sections: LegalSection[] = [
  {
    id: "overview",
    title: "How refunds work",
    body: (
      <p>
        Tickets are sold by the organisers who run each event. Every refund request is reviewed in two stages: first by
        the event’s organiser, who checks it against their event, then by Unifesto, which makes the final decision and
        issues the refund. This protects attendees and organisers from mistaken or fraudulent refunds.
      </p>
    ),
  },
  {
    id: "request",
    title: "Requesting a refund",
    body: (
      <>
        <ol>
          <li>Open the Unifesto app and go to <strong>Tickets</strong>.</li>
          <li>Open the ticket and tap <strong>Refund</strong>, then <strong>Request a refund</strong>.</li>
          <li>Choose or write a reason and submit.</li>
        </ol>
        <p>
          You can follow the request in the same screen as it moves through organiser review, in review and the final
          decision. Organisers can also start a refund for you. Without the app, write to {mail(LEGAL.email.refunds)}{" "}
          from the email or phone number on your account.
        </p>
      </>
    ),
  },
  {
    id: "amount",
    title: "What is refunded",
    body: (
      <ul>
        <li>An approved refund returns the <strong>ticket’s base price</strong>, or the part of it that was approved.</li>
        <li>The processing fee shown at checkout (“app fee”) is <strong>not refundable</strong>.</li>
        <li>If you used a coupon, the refund is based on the amount you actually paid.</li>
        <li>Free tickets have nothing to refund; cancel them so the seat goes to someone else.</li>
      </ul>
    ),
  },
  {
    id: "timing",
    title: "Timelines",
    body: (
      <p>
        Approved refunds are sent back to the original payment method through Razorpay. Banks and card networks usually
        credit them within 5 to 7 working days of approval, sometimes longer. You are notified when the refund is
        approved or declined, with the reason if declined.
      </p>
    ),
  },
  {
    id: "cancelled",
    title: "If an event is cancelled or changed",
    body: (
      <ul>
        <li><strong>Cancelled by the organiser:</strong> you are entitled to a refund of the ticket’s base price.</li>
        <li><strong>Postponed or materially changed:</strong> your ticket stays valid for the new date. If you cannot attend, you may request a refund, which the organiser and Unifesto review as above.</li>
      </ul>
    ),
  },
  {
    id: "not-eligible",
    title: "When a refund may be declined",
    body: (
      <ul>
        <li>The event took place and you did not attend, or you were refused entry for breaking the venue’s rules.</li>
        <li>The organiser stated before you bought that the ticket is non-refundable, and the event happened as described.</li>
        <li>The ticket was already checked in or already refunded.</li>
      </ul>
    ),
  },
  {
    id: "stays",
    title: "Stays",
    body: (
      <ul>
        <li>Free stays and stays paid at the property involve no payment through Unifesto.</li>
        <li>Online stays are paid only after the event team approves your request. A paid online stay can be cancelled by the event team, who can refund its base amount (the processing fee is not refundable) straight to your original payment method. Ask the event team, or write to us, to cancel.</li>
        <li>If a payment arrives after a booking has expired or been cancelled, it is refunded in full automatically.</li>
        <li>If you do not pay within the payment window, the booking expires and the beds are released; nothing is charged.</li>
      </ul>
    ),
  },
  {
    id: "contact",
    title: "Questions and complaints",
    body: (
      <p>
        For refund questions write to {mail(LEGAL.email.refunds)}. If you are unhappy with a decision, contact our
        Grievance Officer, <strong>{LEGAL.grievance.name}</strong>, at {mail(LEGAL.grievance.email)}. Complaints are
        acknowledged within 24 hours and resolved within 15 days.
      </p>
    ),
  },
];

export default function RefundPage() {
  return (
    <LegalPage
      title="Refund and Cancellation Policy"
      path="/refund"
      lines={["Refunds and", "cancellations"]}
      lede="How to ask for a refund, who reviews it, what comes back to you, and how long it takes."
      sections={sections}
    />
  );
}
