import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import LegalPage, { type LegalSection } from "@/components/site/LegalPage";
import { LEGAL } from "@/lib/legal";

/* Account deletion, as the backend actually does it (users.service:
   requestAccountDeletion → 30-day grace → purgeDueDeletions/closeAccount).
   This page is the web deletion URL listed on Google Play and the App
   Store, so it must stay accurate and reachable without signing in. */

export const metadata: Metadata = withSocial({
  title: "Delete your account",
  description:
    "How to delete your Unifesto account in the app or by email, the 30-day grace period, what data is deleted and what is kept by law.",
  alternates: { canonical: "/delete-account" },
}, { title: "Delete your Unifesto account" });

const mail = (e: string, subject?: string) => (
  <a href={`mailto:${e}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`}>{e}</a>
);

const sections: LegalSection[] = [
  {
    id: "in-app",
    title: "Delete in the app",
    body: (
      <ol>
        <li>Open the Unifesto app and sign in.</li>
        <li>Go to <strong>Profile</strong>, then <strong>Account</strong>.</li>
        <li>Tap <strong>Delete account</strong> and confirm.</li>
      </ol>
    ),
  },
  {
    id: "by-email",
    title: "No access to the app",
    body: (
      <p>
        Write to {mail(LEGAL.email.privacy, "Delete my account")} with the subject “Delete my account”, from the
        email address or with the mobile number you sign in with. We will confirm it is you and start the deletion within
        7 days.
      </p>
    ),
  },
  {
    id: "grace",
    title: "The 30-day grace period",
    body: (
      <p>
        Nothing is removed straight away. Your account closes automatically 30 days after you ask. Change your mind before
        then and you can cancel the deletion from the app and keep your account as it is.
      </p>
    ),
  },
  {
    id: "before",
    title: "Before your account can close",
    body: (
      <ul>
        <li>If you created a Space, transfer its ownership to another member or archive it.</li>
        <li>If you hold a ticket for an event that has not ended, cancel it or wait until the event is over.</li>
      </ul>
    ),
  },
  {
    id: "deleted",
    title: "What is deleted",
    body: (
      <>
        <p>When your account closes we permanently remove:</p>
        <ul>
          <li>your name, username, mobile number, profile photo, bio, gender and social links;</li>
          <li>every sign-in method (mobile, email, Google, Apple), so the same email or number can be used for a new account;</li>
          <li>your saved payout bank accounts, notification settings, push devices and saved events;</li>
          <li>your roles in Spaces, sponsor access and check-in permissions.</li>
        </ul>
      </>
    ),
  },
  {
    id: "kept",
    title: "What is kept, and why",
    body: (
      <>
        <ul>
          <li>Payment, refund, payout and tax records, which the law requires us to keep (up to eight years). They stay attached to a closed account with no name or contact details.</li>
          <li>Event records such as registrations, check-ins and stay bookings, which the organisers of those events rely on. Answers you gave to an organiser’s questions stay with that event.</li>
        </ul>
        <p>
          To also erase your registration answers and stay details, say so in your email to{" "}
          {mail(LEGAL.email.privacy, "Delete my account")}. See the <a href="/privacy">Privacy Policy</a> for more.
        </p>
      </>
    ),
  },
];

export default function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete your account"
      path="/delete-account"
      lines={["Delete your", "Unifesto account"]}
      lede="You can delete your account at any time, in the Unifesto app or by email. Here is exactly what happens."
      sections={sections}
    />
  );
}
