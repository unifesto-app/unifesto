import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withSocial } from "@/lib/seo";
import { getOpenRoles } from "@/lib/api/careers";

export const metadata: Metadata = withSocial({
  alternates: { canonical: "/careers" },
  title: "Careers",
  description: "Join the Unifesto team and help transform event management. Explore open positions and grow your career with us.",
  keywords: ["unifesto careers", "jobs at unifesto", "event tech jobs", "startup careers", "tech jobs", "event management careers"],
}, { title: "Careers | Join Unifesto", description: "Join the Unifesto team and help transform event management. Explore open positions." });

export default async function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // K11: no open roles → no careers page (404, not indexed); Navbar/Footer hide the link.
  if (!(await getOpenRoles()).length) notFound();
  return <>{children}</>;
}
