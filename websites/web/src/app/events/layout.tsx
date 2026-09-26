import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Events | Unifesto",
  description: "Discover events from institutions, clubs, communities, and startups. Browse hackathons, cultural fests, workshops, and more.",
  keywords: ["events", "community events", "club events", "hackathons", "cultural events", "workshops", "startup events"],
  openGraph: {
    title: "Events | Unifesto",
    description: "Discover events from institutions, clubs, communities, and startups.",
    type: "website",
    url: "https://www.unifesto.app/events",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary_large_image",
    title: "Events | Unifesto",
    description: "Discover events from institutions, clubs, communities, and startups.",
    site: "@unifestoapp",
  },
};

export default function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
