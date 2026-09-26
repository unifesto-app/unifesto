import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Careers | Unifesto",
  description: "Join the Unifesto team and help transform event management. Explore open positions and grow your career with us.",
  keywords: ["unifesto careers", "jobs at unifesto", "event tech jobs", "startup careers", "tech jobs", "event management careers"],
  openGraph: {
    title: "Careers | Join Unifesto",
    description: "Join the Unifesto team and help transform event management. Explore open positions.",
    type: "website",
    url: "https://www.unifesto.app/careers",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary_large_image",
    title: "Careers | Join Unifesto",
    description: "Join the Unifesto team and help transform event management.",
    site: "@unifestoapp",
  },
};

export default function CareersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
