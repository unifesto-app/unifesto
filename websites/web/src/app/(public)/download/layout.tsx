import type { Metadata } from 'next';
import { withSocial } from "@/lib/seo";

// On the layout: the page is a client component, which can't export it.
export const dynamic = 'force-static'; // prerendered, CDN-cacheable: lib/cached-pages.ts

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
