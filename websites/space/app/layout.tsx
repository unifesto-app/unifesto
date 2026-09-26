import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const agrandir = localFont({
  src: "./assets/fonts/Agrandir/Agrandir-Regular.otf",
  variable: "--font-agrandir",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Space • Unifesto",
  description:
    "Run your space on Unifesto — plan, members, events and money, in one operator console.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
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
