import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import LegalPage, { type LegalSection } from "@/components/site/LegalPage";
import { LEGAL } from "@/lib/legal";

/* Privacy Notice: the short, standalone notice DPDP Rules, 2025 (Rule 3)
   ask for at the point of consent. It itemises data and purposes, and
   says how to withdraw consent, exercise rights and complain to the
   Board. Must stay consistent with /privacy, which has the detail. */

export const metadata: Metadata = withSocial({
  title: "Privacy Notice",
  description:
    "A short notice of the personal data Unifesto asks for, why, and how to withdraw consent, exercise your rights or complain, under India's DPDP Act, 2023.",
  alternates: { canonical: "/privacy-notice" },
}, { title: "Unifesto Privacy Notice" });

const mail = (e: string) => <a href={`mailto:${e}`}>{e}</a>;

const ITEMS = [
  { data: "Mobile number or email", purpose: "Creating your account and signing you in with a one-time code" },
  { data: "Name, username, gender, photo, bio, social links", purpose: "Your profile, your passes and certificates, and what organisers see when you register" },
  { data: "Registration answers, uploaded files, team members", purpose: "Registering you for an event, as the organiser asked" },
  { data: "Guest details and photo ID (stays only)", purpose: "Booking event accommodation and checking guests in" },
  { data: "Payment and refund references (never card or UPI details)", purpose: "Taking payment, refunding, and keeping records the law requires" },
  { data: "City (optional, from your device location)", purpose: "Showing events near you" },
  { data: "App version, push subscription, crash reports, screens used", purpose: "Sending notifications you turn on, and keeping the app working" },
] as const;

const sections: LegalSection[] = [
  {
    id: "who",
    title: "Who is asking",
    body: (
      <p>
        {LEGAL.company} (“Unifesto”) is the Data Fiduciary for the personal data you give us to use the Unifesto
        website, app and Space console. When you register for an event, the organiser of that event also receives your
        registration details to run it.
      </p>
    ),
  },
  {
    id: "data",
    title: "What we ask for and why",
    body: (
      <>
        <table>
          <caption className="sr-only">Personal data and the purpose it is used for</caption>
          <thead>
            <tr><th scope="col">Personal data</th><th scope="col">Used for</th></tr>
          </thead>
          <tbody>
            {ITEMS.map((i) => (
              <tr key={i.data}><td>{i.data}</td><td>{i.purpose}</td></tr>
            ))}
          </tbody>
        </table>
        <p>
          We use it only for these purposes. We do not sell it or share it with advertisers. The full list of who
          processes it for us is on the <a href="/subprocessors">Subprocessor List</a>.
        </p>
      </>
    ),
  },
  {
    id: "withdraw",
    title: "Withdrawing consent",
    body: (
      <>
        <p>Withdrawing consent is as easy as giving it:</p>
        <ul>
          <li>turn off notifications, campaigns or location in the app’s settings or your device settings;</li>
          <li><a href="/delete-account">delete your account</a> from the app; or</li>
          <li>write to {mail(LEGAL.email.privacy)}.</li>
        </ul>
        <p>
          After you withdraw, we stop the processing that relied on that consent, unless the law requires us to keep
          something (for example payment records). Processing already done stays lawful.
        </p>
      </>
    ),
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <p>
        You can ask for a summary of your data, correct or erase it, nominate someone to act for you, and have
        complaints addressed. Use the <a href="/privacy-requests">Privacy Request Center</a>; the{" "}
        <a href="/data-rights">Data Principal Rights Policy</a> explains how we handle each request.
      </p>
    ),
  },
  {
    id: "complain",
    title: "Complaints",
    body: (
      <p>
        Contact our Grievance Officer, <strong>{LEGAL.grievance.name}</strong>, at {mail(LEGAL.grievance.email)}. If
        you are not satisfied with our response, you can complain to the Data Protection Board of India. See the{" "}
        <a href="/grievance">Grievance Redressal Policy</a>.
      </p>
    ),
  },
];

export default function PrivacyNoticePage() {
  return (
    <LegalPage
      title="Privacy Notice"
      path="/privacy-notice"
      lines={["Privacy Notice"]}
      lede={<>The one-page version: what we ask for, why, and how to take it back. The <a href="/privacy" className="link-draw text-paper">Privacy Policy</a> has the detail.</>}
      sections={sections}
    />
  );
}
