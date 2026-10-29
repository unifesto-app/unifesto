import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";

/* The text is the latest published version of the "subprocessors" legal
   document (K7, edited in Apex); this file keeps the route and metadata.
   Subprocessor List. Keep it in step with the processors table in the
   Privacy Policy when a vendor changes. */

export const metadata: Metadata = withSocial({
  title: "Subprocessor List",
  description:
    "The third-party service providers that process personal data on Unifesto's behalf, what for, and where.",
  alternates: { canonical: "/subprocessors" },
}, { title: "Unifesto Subprocessor List" });

export const revalidate = 300;

export default function SubprocessorsPage() {
  return (
    <LegalDocPage
      slug="subprocessors"
      title="Subprocessor List"
      path="/subprocessors"
      lines={["Subprocessors"]}
      lede="Every company that processes personal data for us, what it does, and where."
    />
  );
}
