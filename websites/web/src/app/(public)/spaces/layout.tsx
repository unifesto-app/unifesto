import { Metadata } from "next";
import { withSocial } from "@/lib/seo";

export const metadata: Metadata = withSocial({
  alternates: { canonical: "/spaces" },
  title: "Spaces",
  description: "Explore institutions, clubs, communities, and startups on Unifesto. Discover events from your favorite spaces.",
  keywords: ["event spaces", "clubs", "communities", "institutions", "startups"],
}, { title: "Spaces on Unifesto", description: "Explore universities, clubs, and communities on Unifesto." });

export default function SpacesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
