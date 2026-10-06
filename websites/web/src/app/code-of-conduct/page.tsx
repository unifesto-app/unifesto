import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import LegalPage, { type LegalSection } from "@/components/site/LegalPage";
import { LEGAL } from "@/lib/legal";

/* Code of Conduct for everyone on Unifesto and at events run through it:
   attendees, organisers and their crew, hackathon judges, mentors and
   volunteers, and sponsors. Enforcement mirrors what the product can do
   (report sheet in the app, content reports reviewed in Apex). */

export const metadata: Metadata = withSocial({
  title: "Code of Conduct",
  description:
    "How attendees, organisers, judges, mentors, volunteers and sponsors are expected to behave on Unifesto and at events run through it.",
  alternates: { canonical: "/code-of-conduct" },
}, { title: "Unifesto Code of Conduct" });

const mail = (e: string) => <a href={`mailto:${e}`}>{e}</a>;

const sections: LegalSection[] = [
  {
    id: "everyone",
    title: "For everyone",
    body: (
      <>
        <p>Unifesto is for people coming together. Wherever you meet through it, online or at the venue:</p>
        <ul>
          <li>Treat people with respect. No harassment, bullying, threats or intimidation.</li>
          <li>No discrimination on grounds of gender, caste, religion, ethnicity, disability, sexual orientation, age or background.</li>
          <li>No unwelcome sexual attention, comments or contact, and no photographing or recording people who do not want it.</li>
          <li>No spam, scams, impersonation or fake events and accounts.</li>
          <li>Respect privacy: do not share other people’s contact details, passes or registration data.</li>
          <li>Follow the law, the venue’s rules, and the event team’s safety instructions.</li>
        </ul>
      </>
    ),
  },
  {
    id: "organisers",
    title: "Organisers and their teams",
    body: (
      <ul>
        <li>Describe your event honestly, including price, venue, dates and what is included.</li>
        <li>Make the event safe and accessible, with a way for people to raise concerns on the day.</li>
        <li>Use attendee data only to run your event. Never sell it or add people to unrelated lists.</li>
        <li>Act on reports of misconduct at your event and tell us about serious incidents.</li>
        <li>Make sure your crew, volunteers and co-hosts follow this Code.</li>
      </ul>
    ),
  },
  {
    id: "hackathons",
    title: "Hackathon judges, mentors and participants",
    body: (
      <ul>
        <li>Judges score fairly against the published rubric and declare any conflict of interest.</li>
        <li>Mentors and volunteers help every team equally and keep team work confidential.</li>
        <li>Participants submit their own team’s work and follow the hackathon’s rules on prior work and outside help.</li>
      </ul>
    ),
  },
  {
    id: "sponsors",
    title: "Sponsors",
    body: (
      <p>
        Collect leads only when an attendee chooses to share them, by letting you scan their pass or sending you an
        enquiry. Do not pressure attendees, and contact them only about what they showed interest in.
      </p>
    ),
  },
  {
    id: "report",
    title: "Reporting a problem",
    body: (
      <ul>
        <li><strong>In danger?</strong> Call 112 first, then tell the event team.</li>
        <li><strong>At an event:</strong> tell the organiser or volunteers on site.</li>
        <li><strong>In the app:</strong> use <strong>Report</strong> on the event or Space.</li>
        <li><strong>Anything else:</strong> write to {mail(LEGAL.grievance.email)}. We keep reports confidential and do not tolerate retaliation against people who report in good faith.</li>
      </ul>
    ),
  },
  {
    id: "enforcement",
    title: "What happens if someone breaks this Code",
    body: (
      <p>
        Organisers may remove someone from their event without a refund. Unifesto may remove content, unpublish events,
        restrict or close accounts or Spaces, withhold payouts tied to fraud, and report unlawful conduct to the
        authorities. We look at what happened and its seriousness, and you can contest our decision through the{" "}
        <a href="/grievance">Grievance Redressal Policy</a>.
      </p>
    ),
  },
];

export default function CodeOfConductPage() {
  return (
    <LegalPage
      title="Code of Conduct"
      path="/code-of-conduct"
      lines={["Code of Conduct"]}
      lede="Simple rules for attendees, organisers, judges, mentors, volunteers and sponsors, online and at the venue."
      sections={sections}
    />
  );
}
