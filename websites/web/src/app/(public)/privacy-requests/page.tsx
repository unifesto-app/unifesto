import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LEGAL } from "@/lib/legal";
import { LegalDocPage } from "@/components/site/LegalPage";

/* The text is the latest published version of the "privacy-requests" legal
   document (K7, edited in Apex); this file keeps the route and metadata.
   Privacy Request Center. Points to what people can do themselves in the
   app first, then a pre-filled email per request type. No form: the
   privacy inbox is the system of record, and email from the account's
   address doubles as the first identity check. */

export const metadata: Metadata = withSocial({
  title: "Privacy Request Center",
  description:
    "Ask Unifesto for a copy of your data, a correction, erasure, to withdraw consent or to nominate someone, in a few clicks.",
  alternates: { canonical: "/privacy-requests" },
}, { title: "Unifesto Privacy Request Center" });

export const revalidate = 300;
export const dynamic = "force-static"; // prerendered, CDN-cacheable: lib/cached-pages.ts

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

export default function PrivacyRequestsPage() {
  return (
    <LegalDocPage
      slug="privacy-requests"
      title="Privacy Request Center"
      path="/privacy-requests"
      lines={["Privacy requests"]}
      lede="Get, fix, erase or stop the use of your personal data. Most of it takes one tap in the app."
      slots={{
        requests: (
          <ul>
            {REQUESTS.map((r) => (
              <li key={r.subject}><a href={ask(r.subject, r.body)}>{r.label}</a></li>
            ))}
          </ul>
        ),
      }}
    />
  );
}
