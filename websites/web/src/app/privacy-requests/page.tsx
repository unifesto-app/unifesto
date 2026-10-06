import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import LegalPage, { type LegalSection } from "@/components/site/LegalPage";
import { LEGAL } from "@/lib/legal";

/* Privacy Request Center. Points to what people can do themselves in the
   app first, then a pre-filled email per request type. No form: the
   privacy inbox is the system of record, and email from the account's
   address doubles as the first identity check. */

export const metadata: Metadata = withSocial({
  title: "Privacy Request Center",
  description:
    "Ask Unifesto for a copy of your data, a correction, erasure, to withdraw consent or to nominate someone, in a few clicks.",
  alternates: { canonical: "/privacy-requests" },
}, { title: "Unifesto Privacy Request Center" });

const ask = (subject: string, body: string) =>
  `mailto:${LEGAL.email.privacy}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

const ACCOUNT = "Account email or phone: \nUsername: \n\n";

const REQUESTS = [
  { label: "Get a summary of my data", subject: "Access request", body: `${ACCOUNT}Please send me a summary of the personal data you hold about me.` },
  { label: "Correct my data", subject: "Correction request", body: `${ACCOUNT}What is wrong, and what it should be:\n` },
  { label: "Erase my data", subject: "Erasure request", body: `${ACCOUNT}Please erase (everything / the following):\n` },
  { label: "Withdraw consent", subject: "Withdraw consent", body: `${ACCOUNT}I withdraw my consent for:\n` },
  { label: "Nominate someone", subject: "Nomination", body: `${ACCOUNT}Nominee name:\nNominee email or phone:\nRelationship:\n` },
  { label: "Something else", subject: "Privacy question", body: ACCOUNT },
] as const;

const sections: LegalSection[] = [
  {
    id: "self-serve",
    title: "Do it yourself in the app",
    body: (
      <ul>
        <li><strong>Correct your profile:</strong> Profile → Edit profile.</li>
        <li><strong>Turn off notifications or campaigns:</strong> Profile → Notifications.</li>
        <li><strong>Turn off location, camera or other access:</strong> Profile → Permissions, or your device settings.</li>
        <li><strong>Delete your account:</strong> Profile → Account settings → Delete account (see <a href="/delete-account">Delete your account</a>).</li>
      </ul>
    ),
  },
  {
    id: "request",
    title: "Send us a request",
    body: (
      <>
        <p>
          Pick a request below. It opens an email to {LEGAL.email.privacy} with the details we need. Send it from the
          email on your account so we can verify you quickly.
        </p>
        <ul>
          {REQUESTS.map((r) => (
            <li key={r.subject}><a href={ask(r.subject, r.body)}>{r.label}</a></li>
          ))}
        </ul>
        <p>
          Making a request for someone else (a child, a person in your care, or as a nominee)? Say so in the email and
          we will tell you what proof we need.
        </p>
      </>
    ),
  },
  {
    id: "next",
    title: "What happens next",
    body: (
      <ol>
        <li>We acknowledge your request within 48 hours.</li>
        <li>We may ask you to confirm it is you.</li>
        <li>We complete it within 15 days (30 for erasure) and tell you what we did, or explain anything we could not do.</li>
      </ol>
    ),
  },
  {
    id: "help",
    title: "Not happy with the answer?",
    body: (
      <p>
        Contact the Grievance Officer, {LEGAL.grievance.name}, at{" "}
        <a href={`mailto:${LEGAL.grievance.email}`}>{LEGAL.grievance.email}</a>. The{" "}
        <a href="/data-rights">Data Principal Rights Policy</a> explains your rights and our process in full.
      </p>
    ),
  },
];

export default function PrivacyRequestsPage() {
  return (
    <LegalPage
      title="Privacy Request Center"
      path="/privacy-requests"
      lines={["Privacy requests"]}
      lede="Get, fix, erase or stop the use of your personal data. Most of it takes one tap in the app."
      sections={sections}
    />
  );
}
