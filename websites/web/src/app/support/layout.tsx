import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support | Unifesto",
  description: "Get help with Unifesto. Browse FAQs, submit support tickets, and contact our team for assistance.",
  keywords: ["unifesto support", "help center", "customer support", "faq", "contact support", "help desk"],
  openGraph: {
    title: "Support | Unifesto",
    description: "Get help with Unifesto. Browse FAQs, submit support tickets, and contact our team.",
    type: "website",
    url: "https://www.unifesto.app/support",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary",
    title: "Support | Unifesto",
    description: "Get help with Unifesto. Browse FAQs, submit support tickets, and contact our team.",
    site: "@unifestoapp",
  },
};

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
