import { Metadata } from "next";
import { withSocial } from "@/lib/seo";

export const metadata: Metadata = withSocial({
  alternates: { canonical: "/docs" },
  title: "Documentation",
  description: "Complete API documentation and developer guides for integrating with the Unifesto platform.",
  keywords: ["unifesto api", "api documentation", "developer docs", "api reference", "integration guide", "webhooks"],
}, { title: "Unifesto Docs", description: "Complete API documentation and developer guides for integrating with Unifesto." });

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
