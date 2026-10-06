import { Metadata } from "next";
import { withSocial } from "@/lib/seo";

export const metadata: Metadata = withSocial({
  alternates: { canonical: "/support" },
  title: "Support",
  description: "Get help with Unifesto. Search common questions or reach our team on email or WhatsApp.",
  keywords: ["unifesto support", "help center", "customer support", "faq", "contact support", "whatsapp support"],
}, { title: "Unifesto Support", description: "Get help with Unifesto. Search common questions or reach our team on email or WhatsApp." });

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
