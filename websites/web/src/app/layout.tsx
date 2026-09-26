import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import FloatingSupport from "@/components/FloatingSupport";
import UtmCapture from "@/components/UtmCapture";

const agrandir = localFont({
  src: "./assets/fonts/Agrandir/Agrandir-Regular.otf",
  variable: "--font-agrandir",
  display: "swap",
});

const sweetApricot = localFont({
  src: "./assets/fonts/SweetApricot/SweetApricot.ttf",
  variable: "--font-sweet-apricot",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Unifesto | Optimize. Organize. Elevate. Events.",
  description:
    "Unifesto is the premium event platform for discovering, hosting, and elevating events run by institutions, clubs, communities, and startups. Discover events, manage registrations, and connect with your community.",
  keywords: [
    "community events",
    "institution events",
    "Unifesto",
    "club events",
    "startup events",
    "event management",
    "event discovery",
    "community activities",
    "organisation events",
    "event ticketing",
  ],
  authors: [{ name: "Unifesto" }],
  creator: "Unifesto",
  publisher: "Unifesto Private Limited",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  metadataBase: new URL("https://www.unifesto.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Unifesto | Optimize. Organize. Elevate. Events.",
    description: "Discover and host premium events with Unifesto. The all-in-one platform for institutions, clubs, communities, and startups.",
    type: "website",
    url: "https://www.unifesto.app",
    siteName: "Unifesto",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Unifesto | Optimize. Organize. Elevate. Events.",
    description: "Discover and host premium events with Unifesto.",
    site: "@unifestoapp",
    creator: "@unifestoapp",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${agrandir.variable} ${sweetApricot.variable} scroll-smooth`}>
      <body className="min-h-screen bg-black antialiased">
        <UtmCapture />
        {children}
        <FloatingSupport />
      </body>
    </html>
  );
}
