import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import LegalPage, { type LegalSection } from "@/components/site/LegalPage";
import { LEGAL } from "@/lib/legal";

/* Responsible Disclosure Policy. /.well-known/security.txt points here.
   No paid bounty is promised; change the "rewards" section if one starts. */

export const metadata: Metadata = withSocial({
  title: "Responsible Disclosure Policy",
  description:
    "How to report a security vulnerability in Unifesto, what is in scope, and our commitment to researchers who report in good faith.",
  alternates: { canonical: "/security" },
}, { title: "Unifesto Responsible Disclosure Policy" });

const mail = (e: string) => <a href={`mailto:${e}`}>{e}</a>;

const sections: LegalSection[] = [
  {
    id: "report",
    title: "Reporting a vulnerability",
    body: (
      <>
        <p>
          If you think you have found a security issue in Unifesto, email {mail(LEGAL.email.security)} with:
        </p>
        <ul>
          <li>what the issue is and where (URL, endpoint, app screen and version);</li>
          <li>steps to reproduce it, and a proof of concept if you have one;</li>
          <li>the impact you think it has;</li>
          <li>how to reach you, and whether you would like to be credited.</li>
        </ul>
      </>
    ),
  },
  {
    id: "scope",
    title: "In scope",
    body: (
      <ul>
        <li>unifesto.app and its subdomains, including space.unifesto.app and the Unifesto API;</li>
        <li>the Unifesto app for iOS and Android.</li>
      </ul>
    ),
  },
  {
    id: "out-of-scope",
    title: "Out of scope",
    body: (
      <ul>
        <li>Services we use but do not run (Razorpay, AWS, Google, Apple, Meta, OneSignal and others). Report those to the provider.</li>
        <li>Denial of service, load or spam testing, and social engineering or phishing of our team or users.</li>
        <li>Physical attacks on offices or event venues.</li>
        <li>Missing best-practice headers, clickjacking on pages with no sensitive action, self-XSS, or rate limits without demonstrated impact.</li>
        <li>Reports from automated scanners without a working proof of concept.</li>
      </ul>
    ),
  },
  {
    id: "rules",
    title: "Testing rules",
    body: (
      <ul>
        <li>Use only accounts you own or have permission to use. Do not access, change or delete other people’s data; if you reach any, stop, and include only what is needed to show the issue.</li>
        <li>Do not make real payments or refunds to test, or disrupt live events.</li>
        <li>Give us reasonable time to fix the issue before telling anyone else, and do not share it publicly until we confirm it is fixed.</li>
      </ul>
    ),
  },
  {
    id: "commitment",
    title: "Our commitment",
    body: (
      <ul>
        <li>We acknowledge your report within 3 working days and keep you updated until it is fixed.</li>
        <li>If you follow this policy in good faith, we will not take legal action against you for your research, and we will treat it as authorised.</li>
        <li>With your permission, we credit you once the issue is fixed.</li>
      </ul>
    ),
  },
  {
    id: "rewards",
    title: "Rewards",
    body: (
      <p>We do not run a paid bug bounty at this time. We are grateful for every valid report and say so publicly if you would like.</p>
    ),
  },
];

export default function SecurityPage() {
  return (
    <LegalPage
      title="Responsible Disclosure Policy"
      path="/security"
      lines={["Responsible", "disclosure"]}
      lede="Found a security problem? Tell us privately first. Here is how, what is in scope, and what we promise in return."
      sections={sections}
    />
  );
}
