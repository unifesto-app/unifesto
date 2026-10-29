import { Metadata } from "next";
import { withSocial } from "@/lib/seo";

export const metadata: Metadata = withSocial({
  alternates: { canonical: "/events" },
  title: "Events",
  description: "Discover events from institutions, clubs, communities, and startups. Browse hackathons, cultural fests, workshops, and more.",
  keywords: ["events", "community events", "club events", "hackathons", "cultural events", "workshops", "startup events"],
}, { title: "Events on Unifesto", description: "Discover events from institutions, clubs, communities, and startups." });

export default function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
