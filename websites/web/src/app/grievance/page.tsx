import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import { LegalDocPage } from "@/components/site/LegalPage";
import { LEGAL } from "@/lib/legal";
import GrievanceForm from "@/components/GrievanceForm";

/* The text is the latest published version of the "grievance" legal
   document (I2, edited in Apex); this file keeps the route and metadata.
   Grievance Redressal Policy. One mechanism serving three laws: IT
   (Intermediary Guidelines) Rules, 2021 (Rule 3(2): 24h ack, 15 days,
   72h for removal requests, 24h for intimate imagery; appeal to the GAC),
   Consumer Protection (E-Commerce) Rules, 2020 (48h ack, 1 month), and
   the DPDP Act, 2023 (then the Data Protection Board). We commit to the
   strictest of each. */

export const metadata: Metadata = withSocial({
  title: "Grievance Redressal Policy",
  description:
    "How to raise a complaint with Unifesto's Grievance Officer, response timelines, and where to escalate under Indian law.",
  alternates: { canonical: "/grievance" },
}, { title: "Unifesto Grievance Redressal Policy" });

export const revalidate = 300;

export default function GrievancePage() {
  return (
    <LegalDocPage
      slug="grievance"
      title="Grievance Redressal Policy"
      path="/grievance"
      lines={["Grievance", "redressal"]}
      lede="Who to write to when something has gone wrong, how fast we answer, and where to go next."
      slots={{ "grievance-form": <GrievanceForm officerEmail={LEGAL.grievance.email} /> }}
    />
  );
}
