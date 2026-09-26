import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Host an Event | Unifesto",
  description: "Create and host your event on Unifesto. Reach thousands of attendees with our event management platform.",
  keywords: ["host event", "create event", "event hosting", "event management", "organize event", "event creation"],
  openGraph: {
    title: "Host an Event | Unifesto",
    description: "Create and host your event on Unifesto. Reach thousands of attendees.",
    type: "website",
    url: "https://www.unifesto.app/host",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary_large_image",
    title: "Host an Event | Unifesto",
    description: "Create and host your event on Unifesto. Reach thousands of attendees.",
    site: "@unifestoapp",
  },
};

export default function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
