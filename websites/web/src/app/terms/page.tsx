import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import LegalPage, { type LegalSection } from "@/components/site/LegalPage";
import { LEGAL } from "@/lib/legal";

/* Terms of Service. Matches how the product works (sign-in methods,
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

const mail = (e: string) => <a href={`mailto:${e}`}>{e}</a>;

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement",
    body: (
      <>
        <p>
          These Terms are a contract between you and {LEGAL.company} (“Unifesto”, “we”) for using the
          Unifesto website, app and Space console (the “Services”). By creating an account or using the Services
          you agree to these Terms, our <a href="/privacy">Privacy Policy</a>, our{" "}
          <a href="/refund">Refund and Cancellation Policy</a> and <a href="/code-of-conduct">Code of Conduct</a>. If you do not agree, do not use the Services.
        </p>
        <p>
          You must be 18 or older, or use the Services with the consent of a parent or lawful guardian who accepts these
          Terms on your behalf. If you use the Services for a club, institution or company, you confirm you are allowed to
          bind it to these Terms.
        </p>
      </>
    ),
  },
  {
    id: "role",
    title: "What Unifesto is, and is not",
    body: (
      <p>
        Unifesto provides the tools organisers use to publish and run events, and attendees use to find, register for and
        attend them. Events are organised by the Spaces that publish them, not by Unifesto. The organiser is responsible
        for the event itself: its content, venue, safety, accuracy of information, and whether it takes place. Unifesto
        acts as an intermediary under the Information Technology Act, 2000 for content organisers and users publish.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Your account",
    body: (
      <ul>
        <li>You sign in with your mobile number (with a one-time code), email, Google or Apple. Keep access to these secure; you are responsible for activity on your account.</li>
        <li>Give accurate information, keep it current, and use one account per person.</li>
        <li>Tell us at {mail(LEGAL.email.support)} if you suspect unauthorised use.</li>
        <li>You can delete your account at any time (see <a href="/delete-account">Delete your account</a>).</li>
      </ul>
    ),
  },
  {
    id: "organisers",
    title: "Spaces and organisers",
    body: (
      <>
        <p>A Space is created on request and reviewed by Unifesto before it goes live. If you run a Space or an event, you agree to:</p>
        <ul>
          <li>name a Space after a college, company, club or other organisation only if you are authorised to represent it, and use its name, logo and other marks only with its permission;</li>
          <li>describe events, tickets, prices, dates and venues accurately, and honour the registrations you accept;</li>
          <li>hold any permissions, licences and approvals your event needs, and run it lawfully and safely;</li>
          <li>use attendee data only to run your event and communicate about it, keep it secure, and not sell it or use it for unrelated marketing without the attendee’s consent;</li>
          <li>review refund requests in good faith and cancel registrations properly if the event does not happen;</li>
          <li>give your team only the roles and access they need, and remain responsible for their actions in your Space;</li>
          <li>for stays, list properties accurately, keep guest photo IDs confidential, and take responsibility for the property, rooms and guest safety;</li>
          <li>for sponsors, collect leads only through the sponsor tools, where attendees choose to share their details.</li>
        </ul>
        <p>
          A <strong>verified</strong> badge means Unifesto has checked that the Space is run by, or with the
          permission of, the organisation it names. Other Spaces are run by their members, and a Space naming an
          organisation does not mean that organisation runs, sponsors or endorses it. We may rename, hand over,
          hide or remove a Space that uses an organisation’s name or marks without permission. If you represent an
          organisation, see <a href="/grievance#organisations">Grievance: your organisation’s name or logo</a>.
        </p>
      </>
    ),
  },
  {
    id: "attendees",
    title: "Registering and attending",
    body: (
      <ul>
        <li>A ticket or pass is a licence to attend that event on the organiser’s terms. It is personal unless the organiser transfers it.</li>
        <li>Follow the organiser’s rules at the venue. Organisers may refuse entry for misconduct or an invalid pass.</li>
        <li>For group tickets, the person who buys the seats is responsible for the people they invite.</li>
        <li>Stay bookings need the event team’s approval and, for online stays, payment within the stated window.</li>
      </ul>
    ),
  },
  {
    id: "payments",
    title: "Payments, fees and payouts",
    body: (
      <ul>
        <li>Payments are processed by Razorpay in Indian rupees. Prices are set by organisers and shown before you pay.</li>
        <li>Unifesto charges organisers a platform fee on paid tickets, as listed on our <a href="/pricing">pricing page</a>. A processing fee may be shown to attendees at checkout; it is not refundable. Fees exclude GST, which is charged as applicable.</li>
        <li>Organisers receive payouts to a verified bank account on their Space, after deducting fees and refunds. We may hold or adjust a payout to cover refunds, chargebacks, or suspected fraud.</li>
        <li>Refunds follow our <a href="/refund">Refund and Cancellation Policy</a>.</li>
      </ul>
    ),
  },
  {
    id: "content",
    title: "Your content",
    body: (
      <>
        <p>
          You own what you post (event pages, images, profile details, submissions). You give Unifesto a non-exclusive,
          royalty-free licence to host, display and distribute it within the Services and to promote the events you
          publish, for as long as it is on the Services.
        </p>
        <p>
          The Unifesto name, logo, apps and software belong to Unifesto. You may not copy, modify or reverse engineer
          them except as the law allows.
        </p>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>You must not use the Services to host, publish or share anything that:</p>
        <ul>
          <li>belongs to someone else and you have no right to;</li>
          <li>is obscene, pornographic, paedophilic, invasive of privacy, or harassing on grounds of gender, caste, religion or ethnicity;</li>
          <li>is harmful to children, or promotes violence, hatred or unlawful activity;</li>
          <li>infringes a patent, trademark, copyright or other proprietary right;</li>
          <li>deceives or misleads, including fake events, false prices or impersonation of a person or organisation;</li>
          <li>contains malware, or threatens the unity, integrity, security or sovereignty of India or public order;</li>
          <li>violates any law in force.</li>
        </ul>
        <p>
          You also must not scrape or bulk-collect data, probe or attack our systems, bypass access controls, or resell
          the Services without our permission.
        </p>
        <p>
          Report content that breaks these rules from the report option in the app or to {mail(LEGAL.grievance.email)}.
          We act on reports as the IT (Intermediary Guidelines) Rules, 2021 require, and may remove content, suspend
          events or close accounts that break these Terms.
        </p>
      </>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    body: (
      <p>
        You may stop using the Services and delete your account at any time. We may suspend or end access for a breach of
        these Terms, fraud, a legal requirement, or risk to other users, with notice where the law requires and it is
        practical. Obligations that by their nature should survive (payments owed, records, liability limits, disputes)
        survive termination.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Disclaimers and liability",
    body: (
      <>
        <p>
          We work to keep the Services available and accurate, but they are provided “as is”. We do not guarantee
          that any event will take place as described; that is the organiser’s responsibility.
        </p>
        <p>
          To the extent the law allows, Unifesto is not liable for indirect or consequential loss, or for events,
          venues, stays or conduct of organisers and attendees. Our total liability to you for any claim is limited to the
          fees you paid to Unifesto in the 12 months before the claim. Nothing in these Terms limits rights you have under
          the Consumer Protection Act, 2019 or other law that cannot be excluded.
        </p>
        <p>
          You agree to indemnify Unifesto against claims arising from your breach of these Terms or the law, or, for
          organisers, from events you run.
        </p>
      </>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <p>
        These Terms are governed by the laws of India. Before going to court, contact our Grievance Officer so we can try
        to resolve the issue. Subject to that, the courts at {LEGAL.jurisdiction} have exclusive jurisdiction.
      </p>
    ),
  },
  {
    id: "grievance",
    title: "Grievance Officer",
    body: (
      <p>
        In line with the IT Rules, 2021 and the Consumer Protection (E-Commerce) Rules, 2020, our Grievance Officer is{" "}
        <strong>{LEGAL.grievance.name}</strong>, reachable at {mail(LEGAL.grievance.email)}. Complaints are acknowledged
        within 24 hours and resolved within 15 days.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: (
      <p>
        We may update these Terms as the Services change. The effective date at the top shows the latest version. For
        material changes we will notify you in the app or by email before they apply; continuing to use the Services
        after that means you accept them. Questions about these Terms: {mail(LEGAL.email.legal)}.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      path="/terms"
      lines={["Terms of Service"]}
      lede="The agreement between you and Unifesto, for attendees and organisers alike."
      sections={sections}
    />
  );
}
