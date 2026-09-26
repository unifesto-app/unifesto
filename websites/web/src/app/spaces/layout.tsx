import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Spaces | Unifesto",
  description: "Explore institutions, clubs, communities, and startups on Unifesto. Discover events from your favorite spaces.",
  keywords: ["event spaces", "clubs", "communities", "institutions", "startups"],
  openGraph: {
    title: "Spaces | Unifesto",
    description: "Explore universities, clubs, and communities on Unifesto.",
    type: "website",
    url: "https://www.unifesto.app/spaces",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary_large_image",
    title: "Spaces | Unifesto",
    description: "Explore universities, clubs, and communities on Unifesto.",
    site: "@unifestoapp",
  },
};

export default function SpacesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
