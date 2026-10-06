import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import LegalPage, { type LegalSection } from "@/components/site/LegalPage";
import { LEGAL } from "@/lib/legal";

/* Cookie Policy. Lists exactly what the code stores in the browser: the
   public site sets no cookies (theme in localStorage, landing UTM tags in
   sessionStorage, see lib/utm.ts); the Space and Apex consoles set one
   essential sign-in cookie (space lib/utils/auth.ts). No analytics or ad
   cookies anywhere, so no consent banner. Update if that changes. */

export const metadata: Metadata = withSocial({
  title: "Cookie Policy",
  description:
    "The cookies and browser storage Unifesto uses: no advertising or analytics cookies, one essential sign-in cookie on the organiser console.",
  alternates: { canonical: "/cookies" },
}, { title: "Unifesto Cookie Policy" });

const mail = (e: string) => <a href={`mailto:${e}`}>{e}</a>;

const STORAGE = [
  { name: "theme", where: "unifesto.app (local storage)", purpose: "Remembers light, dark or system theme if you change it", kept: "Until you clear it or pick System" },
  { name: "unifesto.utm", where: "unifesto.app (session storage)", purpose: "Keeps the campaign tags of the link you arrived on, so they carry into the app", kept: "Until you close the tab" },
  { name: "unifesto_token", where: "space.unifesto.app, apex.unifesto.app (cookie and local storage)", purpose: "Keeps you signed in to the organiser console across its subdomains", kept: "30 days, or until you sign out" },
] as const;

const sections: LegalSection[] = [
  {
    id: "summary",
    title: "In short",
    body: (
      <ul>
        <li>The public website (unifesto.app) sets <strong>no cookies</strong>.</li>
        <li>We use <strong>no advertising, tracking or third-party analytics cookies</strong> on any of our websites.</li>
        <li>The organiser console sets one cookie that is strictly necessary to keep you signed in.</li>
      </ul>
    ),
  },
  {
    id: "what",
    title: "What we store in your browser",
    body: (
      <>
        <p>
          Cookies and browser storage are small pieces of data a website keeps on your device. This is the complete
          list of what Unifesto keeps:
        </p>
        <table>
          <caption className="sr-only">Cookies and browser storage used by Unifesto</caption>
          <thead>
            <tr><th scope="col">Name</th><th scope="col">Where</th><th scope="col">Purpose</th><th scope="col">How long</th></tr>
          </thead>
          <tbody>
            {STORAGE.map((s) => (
              <tr key={s.name}><td>{s.name}</td><td>{s.where}</td><td>{s.purpose}</td><td>{s.kept}</td></tr>
            ))}
          </tbody>
        </table>
        <p>
          All three are first-party and strictly necessary or set only when you choose a preference, so they do not need
          a consent banner. None of them is used to track you across other websites.
        </p>
      </>
    ),
  },
  {
    id: "third-party",
    title: "Third parties",
    body: (
      <p>
        Pages that take payments open Razorpay’s checkout, and signing in with Google or Apple opens their sign-in
        page. Those services may set their own cookies under their own policies while you use them. The Unifesto app
        for iOS and Android does not use browser cookies; how it handles data is described in the{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>
    ),
  },
  {
    id: "control",
    title: "Your choices",
    body: (
      <p>
        You can clear or block cookies and site storage in your browser settings. If you block the console’s sign-in
        cookie you will not be able to stay signed in to the organiser console; everything on the public website keeps
        working.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: (
      <p>
        If we ever add a cookie that is not strictly necessary, we will update this page and ask for your consent
        first. Questions: {mail(LEGAL.email.privacy)}.
      </p>
    ),
  },
];

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      path="/cookies"
      lines={["Cookie Policy"]}
      lede="No ad cookies, no tracking cookies. Here is everything we keep in your browser, and why."
      sections={sections}
    />
  );
}
