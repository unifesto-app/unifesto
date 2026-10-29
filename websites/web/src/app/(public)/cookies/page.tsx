import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* The text is the latest published version of the "cookies" legal
   document (I2, edited in Apex); this file keeps the route and metadata.
   Cookie Policy. Lists exactly what the code stores in the browser: the
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

export const revalidate = 300;

export default function CookiesPage() {
  return (
    <LegalDocPage
      slug="cookies"
      title="Cookie Policy"
      path="/cookies"
      lines={["Cookie Policy"]}
      lede="No ad cookies, no tracking cookies. Here is everything we keep in your browser, and why."
    />
  );
}
