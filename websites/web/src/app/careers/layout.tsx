import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";

export const metadata: Metadata = withSocial({
  alternates: { canonical: "/careers" },
  title: "Careers",
  description: "Join the Unifesto team and help transform event management. Explore open positions and grow your career with us.",
  keywords: ["unifesto careers", "jobs at unifesto", "event tech jobs", "startup careers", "tech jobs", "event management careers"],
}, { title: "Careers | Join Unifesto", description: "Join the Unifesto team and help transform event management. Explore open positions." });

export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
