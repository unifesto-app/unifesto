import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import LegalPage, { type LegalSection } from "@/components/site/LegalPage";
import { LEGAL } from "@/lib/legal";

/* Grievance Redressal Policy. One mechanism serving three laws: IT
   (Intermediary Guidelines) Rules, 2021 (Rule 3(2): 24h ack, 15 days,
   72h for removal requests, 24h for intimate imagery; appeal to the GAC),
   Consumer Protection (E-Commerce) Rules, 2020 (48h ack, 1 month), and
   the DPDP Act, 2023 (then the Data Protection Board). We commit to the
   strictest of each. */

export const metadata: Metadata = withSocial({
  title: "Grievance Redressal Policy",
  description:
    "How to raise a complaint with Unifesto's Grievance Officer, response timelines, and where to escalate under Indian law.",
  alternates: { canonical: "/grievance" },
}, { title: "Unifesto Grievance Redressal Policy" });

const mail = (e: string) => <a href={`mailto:${e}`}>{e}</a>;

const sections: LegalSection[] = [
  {
    id: "officer",
    title: "Grievance Officer",
    body: (
      <>
        <p>
          <strong>{LEGAL.grievance.name}</strong>, Grievance Officer
          <br />
          {LEGAL.company}, {LEGAL.address}
          <br />
          Email: {mail(LEGAL.grievance.email)}
        </p>
        <p>
          Most questions are answered faster by {mail(LEGAL.email.support)}. Come to the Grievance Officer when support
          has not resolved your issue, or for anything listed below.
        </p>
      </>
    ),
  },
  {
    id: "scope",
    title: "What you can raise",
    body: (
      <ul>
        <li>Content on Unifesto that breaks our <a href="/terms#acceptable-use">Terms</a> or the <a href="/code-of-conduct">Code of Conduct</a>, or the law.</li>
        <li>A purchase, refund or cancellation that was not handled properly (see the <a href="/refund">Refund Policy</a>).</li>
        <li>How your personal data is handled, or a privacy request we did not resolve.</li>
        <li>A decision to remove your content, suspend an event or close your account.</li>
        <li>Problems with an organiser’s conduct that the organiser has not addressed.</li>
      </ul>
    ),
  },
  {
    id: "how",
    title: "How to raise a grievance",
    body: (
      <>
        <p>Email {mail(LEGAL.grievance.email)} with:</p>
        <ul>
          <li>your name and the email or phone on your Unifesto account;</li>
          <li>what happened, with links to the event, Space, profile or content involved;</li>
          <li>any order or payment reference, and screenshots if helpful;</li>
          <li>what you would like us to do.</li>
        </ul>
        <p>You can also report an event or Space from the app with <strong>Report</strong> in its menu.</p>
      </>
    ),
  },
  {
    id: "timelines",
    title: "Timelines",
    body: (
      <ul>
        <li><strong>Acknowledgement:</strong> within 24 hours, with a ticket number.</li>
        <li><strong>Resolution:</strong> within 15 days.</li>
        <li><strong>Requests to remove unlawful content:</strong> acted on within 72 hours.</li>
        <li><strong>Content showing a person in a sexual act, nudity or impersonation of them in such content:</strong> removed or disabled within 24 hours of the complaint.</li>
      </ul>
    ),
  },
  {
    id: "escalation",
    title: "If you are not satisfied",
    body: (
      <ul>
        <li><strong>Content decisions:</strong> appeal to the Grievance Appellate Committee at <a href="https://gac.gov.in" target="_blank" rel="noopener noreferrer">gac.gov.in</a> within 30 days of our decision.</li>
        <li><strong>Personal data:</strong> complain to the Data Protection Board of India.</li>
        <li><strong>Purchases and refunds:</strong> the National Consumer Helpline (1915, <a href="https://consumerhelpline.gov.in" target="_blank" rel="noopener noreferrer">consumerhelpline.gov.in</a>) or the consumer commission with jurisdiction.</li>
      </ul>
    ),
  },
];

export default function GrievancePage() {
  return (
    <LegalPage
      title="Grievance Redressal Policy"
      path="/grievance"
      lines={["Grievance", "redressal"]}
      lede="Who to write to when something has gone wrong, how fast we answer, and where to go next."
      sections={sections}
    />
  );
}
