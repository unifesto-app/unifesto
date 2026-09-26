import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const agrandir = localFont({
  src: "./assets/fonts/Agrandir/Agrandir-Regular.otf",
  variable: "--font-agrandir",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Apex • Unifesto",
  description:
    "Platform Admin console for Unifesto — mission control for the whole platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body
        className={`${agrandir.variable} font-sans antialiased min-h-full flex flex-col`}
      >
        {children}
      </body>
    </html>
  );
}
