import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import LegalPage, { type LegalSection } from "@/components/site/LegalPage";
import { LEGAL, PROCESSORS } from "@/lib/legal";

/* Subprocessor List. Rendered from the same PROCESSORS list the Privacy
   Policy uses, so the two can never disagree. */

export const metadata: Metadata = withSocial({
  title: "Subprocessor List",
  description:
    "The third-party service providers that process personal data on Unifesto's behalf, what for, and where.",
  alternates: { canonical: "/subprocessors" },
}, { title: "Unifesto Subprocessor List" });

const mail = (e: string) => <a href={`mailto:${e}`}>{e}</a>;

const sections: LegalSection[] = [
  {
    id: "list",
    title: "Current subprocessors",
    body: (
      <>
        <p>
          These providers process personal data for Unifesto under contract, only to deliver the Services and only on
          our instructions.
        </p>
        <table>
          <caption className="sr-only">Subprocessors</caption>
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
    id: "organisers",
    title: "Organisers are not subprocessors",
    body: (
      <p>
        When you register for an event, the Space that runs it receives your registration details to run that event.
        Organisers decide how they use those details for their event, under our <a href="/terms#organisers">Terms</a>,
        and are not listed here.
      </p>
    ),
  },
  {
    id: "safeguards",
    title: "Safeguards",
    body: (
      <ul>
        <li>Our main servers, database and file storage are in India (AWS Mumbai).</li>
        <li>Providers outside India receive only what their purpose needs, under contracts that require them to protect it, and as the DPDP Act permits.</li>
        <li>We review a provider before adding it and remove access when we stop using it.</li>
      </ul>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: (
      <p>
        We update this page before a new subprocessor starts processing personal data. Organisers who want notice of
        changes, or anyone with questions, can write to {mail(LEGAL.email.privacy)}.
      </p>
    ),
  },
];

export default function SubprocessorsPage() {
  return (
    <LegalPage
      title="Subprocessor List"
      path="/subprocessors"
      lines={["Subprocessors"]}
      lede="Every company that processes personal data for us, what it does, and where."
      sections={sections}
    />
  );
}
