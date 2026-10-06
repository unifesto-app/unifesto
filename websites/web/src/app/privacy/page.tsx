import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import LegalPage, { type LegalSection } from "@/components/site/LegalPage";
import { LEGAL, PROCESSORS } from "@/lib/legal";

/* Privacy Policy. Written against what the product actually collects and
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

const mail = (e: string) => <a href={`mailto:${e}`}>{e}</a>;

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          Unifesto is operated by {LEGAL.company} (CIN {LEGAL.cin}), {LEGAL.address} (“Unifesto”,
          “we”, “us”). This policy covers the Unifesto website, the Unifesto app for iOS and Android,
          and the Unifesto Space console (together, the “Services”).
        </p>
        <p>
          For personal data you give us to use the Services, Unifesto is the <strong>Data Fiduciary</strong> under
          India’s Digital Personal Data Protection Act, 2023 (“DPDP Act”). When you register for an event,
          the organiser of that event also receives your registration details and is responsible for how they use them
          (see section 5).
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        <h3>You give us</h3>
        <ul>
          <li><strong>Account:</strong> mobile number, email address (if you sign in with email, Google or Apple), name, username, gender, profile photo, bio and the social links you choose to add.</li>
          <li><strong>Event registrations:</strong> the ticket you choose, the answers you give to an organiser’s questions (which can include files you upload), and the details of team members you register.</li>
          <li><strong>Stays:</strong> for accommodation bookings, each guest’s name, phone, email, gender and a photo ID, plus arrival time and an emergency contact.</li>
          <li><strong>Payments:</strong> payments are made through Razorpay. We receive the order and payment reference, amount and status. We never receive or store your card, UPI PIN or bank login details.</li>
          <li><strong>Organisers:</strong> Space details, event content, team members, and the bank account you add for payouts.</li>
          <li><strong>Participation:</strong> check-ins, hackathon teams and submissions, judging scores, help desk queries, live session participation, support requests, and messages you send to our WhatsApp business number.</li>
        </ul>
        <h3>Collected automatically</h3>
        <ul>
          <li><strong>Device and app:</strong> app version, platform, a push notification subscription ID and the time you were last active.</li>
          <li><strong>Usage and crashes:</strong> in the app, Google Firebase records which screens are used and crash reports, to fix problems and improve the app.</li>
          <li><strong>Page views:</strong> when an event or Space page is opened, we record an anonymous visitor ID, the platform and any campaign (UTM) tags on the link, so organisers can see where visitors came from.</li>
          <li><strong>Location (optional):</strong> if you allow it, the app reads an approximate location while you use it and converts it to your city on your device. Only the city name is sent to us, to show nearby events. We do not collect precise or background location.</li>
        </ul>
        <p>
          The app asks for the camera (to scan QR passes and take photos), microphone (to speak in live sessions), photo
          library and notifications only when you use a feature that needs them. You can change these permissions in
          your device settings at any time.
        </p>
      </>
    ),
  },
  {
    id: "why",
    title: "Why we use it",
    body: (
      <>
        <ul>
          <li>To create and secure your account and sign you in, including one-time codes sent over WhatsApp.</li>
          <li>To register you for events, issue passes and tickets, check you in, and send confirmations, reminders and updates about events you joined.</li>
          <li>To process payments, refunds and payouts, and keep the records tax and accounting law requires.</li>
          <li>To run the features you use: stays, live sessions, hackathons, certificates and support.</li>
          <li>To show nearby and relevant events, and to keep the Services reliable, secure and free of fraud and abuse.</li>
          <li>To send product announcements and campaigns, which you can turn off in Notification settings.</li>
        </ul>
        <p>
          We process your data on the basis of your consent, given when you sign up or use a feature, and for the
          legitimate uses the DPDP Act allows, such as performing a transaction you asked for or complying with the law.
          You can withdraw consent at any time (section 8); this does not affect processing already done.
        </p>
      </>
    ),
  },
  {
    id: "public",
    title: "What other people can see",
    body: (
      <p>
        Your public profile (name, username, photo, bio, social links, the Spaces you follow and the public events you
        are going to or have been to) can be seen by other Unifesto users. Your mobile number, email address and
        registration answers are never shown on your profile. Certificates you earn have a verification link that
        anyone with the link can open.
      </p>
    ),
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <>
        <ul>
          <li><strong>Event organisers:</strong> when you register for an event, its organisers (the Space team and any co-hosting Space) receive your name, contact details, ticket, registration answers and check-in status, to run that event. For stays, the event team receives guest details and photo IDs.</li>
          <li><strong>Sponsors:</strong> only if you let a sponsor scan your pass at their booth or send them an enquiry yourself.</li>
          <li><strong>Hackathon judges and volunteers:</strong> your team, submission and help desk queries, for that hackathon.</li>
          <li><strong>Service providers</strong> who process data for us under contract, listed below.</li>
          <li><strong>Authorities,</strong> when the law requires it or to protect the rights and safety of users and the public.</li>
          <li><strong>A successor,</strong> if Unifesto is merged or acquired, under the same protections.</li>
        </ul>
        <p>We do not sell your personal data, and we do not share it with advertisers.</p>
        <table>
          <caption className="sr-only">Service providers that process personal data</caption>
          <thead>
            <tr><th scope="col">Provider</th><th scope="col">Purpose</th><th scope="col">Location</th></tr>
          </thead>
          <tbody>
            {PROCESSORS.map((p) => (
              <tr key={p.name}><td>{p.name}</td><td>{p.purpose}</td><td>{p.location}</td></tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  },
  {
    id: "storage",
    title: "Where it is stored and how it is protected",
    body: (
      <>
        <p>
          Our servers and database run on Amazon Web Services in India (Mumbai). Some providers above process data
          outside India; such transfers are made as permitted under the DPDP Act and under contracts that require them
          to protect it.
        </p>
        <ul>
          <li>All traffic to the Services is encrypted in transit (HTTPS/TLS).</li>
          <li>Uploaded files such as photo IDs and registration documents are kept in private storage and are available only to the people who need them for that event.</li>
          <li>Access inside organiser teams is limited by role, and Unifesto staff access is restricted and logged.</li>
          <li>Payments are handled by Razorpay, a PCI-DSS compliant payment processor.</li>
        </ul>
        <p>
          If a personal data breach occurs, we will inform the Data Protection Board of India and affected users as the
          DPDP Act and Rules require.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li><strong>Your account:</strong> until you delete it. Deletion closes the account after a 30-day grace period and removes your personal details (see <a href="/delete-account">Delete your account</a>).</li>
        <li><strong>Payment, refund, payout and tax records:</strong> for as long as tax and accounting laws require, which can be up to eight years, with your name and contact details removed once your account is closed.</li>
        <li><strong>Event records</strong> such as registrations, check-ins and stay bookings: kept as part of that event’s records. When your account is closed they are no longer linked to your name or contact details, but answers you gave to an organiser’s questions stay with that event. To have those erased too, write to {mail(LEGAL.email.privacy)}.</li>
        <li><strong>Server and security logs:</strong> kept for a limited period to keep the Services secure and investigate problems.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the DPDP Act you have the right to:</p>
        <ul>
          <li>get a summary of the personal data we hold about you and how it is processed;</li>
          <li>correct, complete or update it (most of it you can edit yourself in the app);</li>
          <li>have it erased, by deleting your account or writing to us;</li>
          <li>withdraw consent and turn off optional processing such as campaigns and location;</li>
          <li>nominate another person to exercise these rights if you die or become incapacitated;</li>
          <li>have your grievances addressed (section 10).</li>
        </ul>
        <p>
          Use the <a href="/privacy-requests">Privacy Request Center</a> or write to {mail(LEGAL.email.privacy)} from
          the email or phone number on your account. We may verify your identity before acting; the{" "}
          <a href="/data-rights">Data Principal Rights Policy</a> explains how we handle each request.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        The Services are meant for people aged 18 and over. Anyone under 18 may use them only with the verifiable
        consent of a parent or lawful guardian. We do not knowingly track, profile or target advertising at children.
        If you believe a child has given us personal data without that consent, write to {mail(LEGAL.email.privacy)} and
        we will delete it.
      </p>
    ),
  },
  {
    id: "grievance",
    title: "Grievance Officer",
    body: (
      <>
        <p>
          If you have a complaint about how your personal data is handled, contact our Grievance Officer,{" "}
          <strong>{LEGAL.grievance.name}</strong>, at {mail(LEGAL.grievance.email)}. We acknowledge complaints within 24
          hours and aim to resolve them within 15 days.
        </p>
        <p>
          If you are not satisfied with our response, you may approach the Data Protection Board of India once it
          accepts complaints under the DPDP Act.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We will update this policy when our practices change and show the new effective date at the top. For material
        changes we will tell you in the app or by email before they take effect.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      path="/privacy"
      lines={["Privacy Policy"]}
      lede="What we collect, why, who sees it, where it lives, how long we keep it, and the rights you have over it. In plain language."
      sections={sections}
    />
  );
}
