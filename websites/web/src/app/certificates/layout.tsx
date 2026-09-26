import { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Certificates | Unifesto",
  description:
    "View and download the certificates you've earned from events on Unifesto.",
  keywords: [
    "certificates",
    "event certificates",
    "participation certificate",
    "download certificate",
  ],
  openGraph: {
    title: "My Certificates | Unifesto",
    description: "View and download the certificates you've earned on Unifesto.",
    type: "website",
    url: "https://www.unifesto.app/certificates",
    siteName: "Unifesto",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function CertificatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
