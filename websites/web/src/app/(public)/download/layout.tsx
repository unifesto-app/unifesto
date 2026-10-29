import type { Metadata } from 'next';
import { withSocial } from "@/lib/seo";

export const metadata: Metadata = withSocial({
  alternates: { canonical: "/download" },
  title: 'Download the Unifesto app',
  // Store redirect utility; /app is the indexable page for the app.
  robots: { index: false, follow: true },
  description: 'Download the Unifesto mobile app for iOS and Android. Discover events, manage tickets, and connect with communities on the go.',
}, { title: 'Download Unifesto App', description: 'Discover events, manage tickets, and connect with communities on the go.' });

export default function DownloadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
