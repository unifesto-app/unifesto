import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import LegalPage, { type LegalSection } from "@/components/site/LegalPage";
import { LEGAL } from "@/lib/legal";

/* Data Principal Rights Policy: how Unifesto handles requests under
   sections 11–14 of the DPDP Act, 2023 and the DPDP Rules, 2025. The
   "how to file" side lives at /privacy-requests. */

export const metadata: Metadata = withSocial({
  title: "Data Principal Rights Policy",
  description:
    "Your rights over your personal data under India's DPDP Act, 2023, and how Unifesto verifies, handles and answers each request.",
  alternates: { canonical: "/data-rights" },
}, { title: "Unifesto Data Principal Rights Policy" });

const mail = (e: string) => <a href={`mailto:${e}`}>{e}</a>;

const sections: LegalSection[] = [
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>As a Data Principal under the Digital Personal Data Protection Act, 2023 you have the right to:</p>
        <ul>
          <li><strong>Access:</strong> a summary of the personal data we hold about you, what we do with it, and who we have shared it with (organisers of events you registered for, and our <a href="/subprocessors">subprocessors</a>).</li>
          <li><strong>Correction and completion:</strong> fix inaccurate or incomplete data and update it. Most profile details you can edit yourself in the app.</li>
          <li><strong>Erasure:</strong> have data erased when it is no longer needed for the purpose you gave it for, or when you withdraw consent.</li>
          <li><strong>Withdraw consent</strong> at any time, as easily as you gave it.</li>
          <li><strong>Nominate</strong> a person to exercise these rights for you if you die or become incapable.</li>
          <li><strong>Grievance redressal:</strong> have your complaints answered, and then go to the Data Protection Board of India if you are not satisfied.</li>
        </ul>
      </>
    ),
  },
  {
    id: "who",
    title: "Who can make a request",
    body: (
      <ul>
        <li>You, for your own data.</li>
        <li>A parent or lawful guardian, for a child or a person with a disability under their care.</li>
        <li>Your nominee, with proof of death or incapacity.</li>
        <li>Someone you authorise in writing, with your consent and their identity.</li>
      </ul>
    ),
  },
  {
    id: "verification",
    title: "Verifying it is you",
    body: (
      <p>
        To protect your data from people pretending to be you, send requests from the email or phone number on your
        account. If that is not possible, we may ask you to confirm a one-time code or give details only the account
        holder would know. We ask for no more than we need, and we never ask for your password or payment details.
      </p>
    ),
  },
  {
    id: "timelines",
    title: "How fast we respond",
    body: (
      <ul>
        <li>We acknowledge every request within <strong>48 hours</strong>.</li>
        <li>We complete access, correction and consent requests within <strong>15 days</strong>, and erasure within <strong>30 days</strong> (account deletion has a 30-day grace period you can cancel).</li>
        <li>If we need longer, we tell you why and when, and never exceed the 90 days the DPDP Rules allow.</li>
        <li>Requests are free.</li>
      </ul>
    ),
  },
  {
    id: "limits",
    title: "When we cannot do everything you ask",
    body: (
      <>
        <p>We will explain any part of a request we cannot complete. The usual reasons are:</p>
        <ul>
          <li>the law requires us to keep it, for example payment, refund, payout and tax records (kept up to eight years, without your contact details once your account is closed);</li>
          <li>it is needed to resolve an open dispute, refund or fraud investigation;</li>
          <li>it is also another person’s data, such as a team registration, where we limit what we share or erase to protect them;</li>
          <li>we cannot verify the request.</li>
        </ul>
        <p>
          Data an organiser already received for an event they ran is held by that organiser too. On request, we pass
          your erasure or correction to them and remove what we hold on our side.
        </p>
      </>
    ),
  },
  {
    id: "duties",
    title: "Your duties",
    body: (
      <p>
        The DPDP Act also asks Data Principals not to impersonate others, not to suppress material information, and not
        to file false or frivolous complaints. Please give accurate information when you make a request.
      </p>
    ),
  },
  {
    id: "how",
    title: "Making a request",
    body: (
      <p>
        Use the <a href="/privacy-requests">Privacy Request Center</a>, or write to {mail(LEGAL.email.privacy)}. If you
        are unhappy with how we handled it, contact the Grievance Officer, {LEGAL.grievance.name}, at{" "}
        {mail(LEGAL.grievance.email)} (see the <a href="/grievance">Grievance Redressal Policy</a>).
      </p>
    ),
  },
];

export default function DataRightsPage() {
  return (
    <LegalPage
      title="Data Principal Rights Policy"
      path="/data-rights"
      lines={["Your data", "rights"]}
      lede="What you can ask us to do with your personal data, who can ask, and how quickly we answer."
      sections={sections}
    />
  );
}
