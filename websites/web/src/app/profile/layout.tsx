import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile | Unifesto",
  description: "Manage your Unifesto profile, view your registered events, and update your preferences.",
  keywords: ["user profile", "my account", "profile settings", "registered events", "account management"],
  openGraph: {
    title: "Profile | Unifesto",
    description: "Manage your Unifesto profile and view your registered events.",
    type: "website",
    url: "https://www.unifesto.app/profile",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary",
    title: "Profile | Unifesto",
    description: "Manage your Unifesto profile and view your registered events.",
    site: "@unifestoapp",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
