import type { Metadata, Viewport } from "next";
import { Michroma, Hanken_Grotesk, Martian_Mono } from "next/font/google";
import "./globals.css";
import FloatingSupport from "@/components/FloatingSupport";
import UtmCapture from "@/components/UtmCapture";
import MotionRuntime from "@/components/MotionRuntime";
import JsonLd from "@/components/site/JsonLd";
import { SITE } from "@/lib/site";

const michroma = Michroma({
  weight: "400",
  variable: "--font-michroma",
  subsets: ["latin"],
  display: "swap",
});

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  display: "swap",
});

// Code snippets only (blog, docs): don't preload it on every page.
const martian = Martian_Mono({
  variable: "--font-martian",
  preload: false,
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Unifesto: Event ticketing, QR check-in and payouts for India",
    template: "%s | Unifesto",
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  publisher: SITE.legalName,
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  // No site-wide canonical: each page declares its own. A root canonical
  // would be inherited by every page and point them all at the home page.
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    site: SITE.twitter,
    creator: SITE.twitter,
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
  other: {
    "apple-itunes-app": "app-id=6767165496",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  colorScheme: "dark light",
};

/* Runs before paint. data-pref is the stored choice (system/light/dark),
   data-theme the resolved one; in system mode it tracks OS changes live.
   Dark is the no-JS fallback since :root holds the dark tokens. ThemeToggle
   calls window.__applyTheme after changing the stored choice. */
const themeScript = `try{var r=document.documentElement,m=matchMedia("(prefers-color-scheme: light)");window.__applyTheme=function(){var p=localStorage.getItem("theme")||"system";r.dataset.pref=p;r.dataset.theme=p==="system"?(m.matches?"light":"dark"):p};__applyTheme();m.addEventListener("change",__applyTheme)}catch(e){}`;

/* Who we are, for search engines and AI assistants. Rendered on every page. */
const orgLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE.url}/#org`,
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url,
    logo: SITE.logo,
    email: SITE.email,
    description: SITE.description,
    foundingLocation: { "@type": "Place", name: "Hyderabad, Telangana, India" },
    areaServed: "IN",
    sameAs: [SITE.appStore, SITE.playStore, "https://x.com/unifestoapp"],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    name: SITE.name,
    url: SITE.url,
    publisher: { "@id": `${SITE.url}/#org` },
    inLanguage: "en-IN",
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN" className={`${michroma.variable} ${hanken.variable} ${martian.variable} scroll-smooth`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-night antialiased">
        <JsonLd data={orgLd} />
        <UtmCapture />
        {children}
        <FloatingSupport />
        <MotionRuntime />
      </body>
    </html>
  );
}
