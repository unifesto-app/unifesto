import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { SITE_URL, ORG, getContent } from "@/lib/site";

// One family for the whole site, two weights (see the type scale in globals.css).
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-dm-sans",
});

const TITLE = "WeGoBeyond · We go beyond";
const DESCRIPTION =
  "Workshops, meetups and hackathons for people who build, in Hyderabad. Partner with WeGoBeyond as a sponsor, venue or community.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · WeGoBeyond",
  },
  description: DESCRIPTION,
  applicationName: "WeGoBeyond",
  authors: [{ name: ORG.legalName, url: SITE_URL }],
  creator: ORG.legalName,
  publisher: ORG.legalName,
  category: "events",
  keywords: [
    "WeGoBeyond",
    "we go beyond",
    "Hyderabad workshops",
    "Hyderabad meetups",
    "hackathons Hyderabad",
    "event sponsorship Hyderabad",
    "venue partner",
    "community partner",
  ],
  alternates: {
    canonical: "/",
  },
  // Emails and numbers in copy are already links; don't let iOS restyle them.
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "WeGoBeyond",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION to the token from Google Search
  // Console (HTML-tag method) to emit the verification meta tag.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#0e0c0b",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { socials, partnersInbox } = await getContent();

  // Who runs the site, for search engines: WeGoBeyond, an initiative of Unifesto.
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#org`,
        name: "WeGoBeyond",
        url: SITE_URL,
        logo: `${SITE_URL}/apple-icon.png`,
        description: DESCRIPTION,
        email: partnersInbox,
        sameAs: socials.find((g) => g.brand === "wegobeyond")?.accounts.map((a) => a.href) ?? [],
        parentOrganization: { "@type": "Organization", name: ORG.legalName, url: "https://unifesto.app" },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#site`,
        name: "WeGoBeyond",
        url: SITE_URL,
        inLanguage: "en-IN",
        publisher: { "@id": `${SITE_URL}/#org` },
      },
    ],
  };

  return (
    <html lang="en-IN" className={dmSans.variable}>
      <body className="flex min-h-svh flex-col">
        <script
          type="application/ld+json"
          // "<" escaped so no value can close the script tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
