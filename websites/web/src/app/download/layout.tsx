import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Download Unifesto App | iOS & Android',
  description: 'Download the Unifesto mobile app for iOS and Android. Discover events, manage tickets, and connect with communities on the go.',
  keywords: ['unifesto app', 'download unifesto', 'event app', 'mobile app', 'ios app', 'android app'],
  openGraph: {
    title: 'Download Unifesto App',
    description: 'Discover events, manage tickets, and connect with communities on the go.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Download Unifesto App',
    description: 'Discover events, manage tickets, and connect with communities on the go.',
  },
};

export default function DownloadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
