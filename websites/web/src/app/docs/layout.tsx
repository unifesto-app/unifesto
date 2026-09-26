import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documentation | Unifesto",
  description: "Complete API documentation and developer guides for integrating with the Unifesto platform.",
  keywords: ["unifesto api", "api documentation", "developer docs", "api reference", "integration guide", "webhooks"],
  openGraph: {
    title: "Documentation | Unifesto",
    description: "Complete API documentation and developer guides for integrating with Unifesto.",
    type: "website",
    url: "https://www.unifesto.app/docs",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary_large_image",
    title: "Documentation | Unifesto",
    description: "Complete API documentation and developer guides for integrating with Unifesto.",
    site: "@unifestoapp",
  },
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
