import type { Metadata } from "next";
import { DM_Sans, Hanken_Grotesk } from "next/font/google";
import "../(public)/globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin", "latin-ext"], axes: ["opsz"], display: "swap" });
const hanken = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Pages other sites frame (K21). No site chrome, support bubble or view
 * beacon. Only /embed/** may be framed: next.config.ts drops X-Frame-Options
 * there and src/proxy.ts sets frame-ancestors for it alone.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    // color-scheme "normal": a frame whose scheme differs from its host's gets an opaque backdrop.
    <html
      lang="en-IN"
      className={`${dmSans.variable} ${hanken.variable}`}
      style={{ colorScheme: "normal", background: "transparent" }}
      suppressHydrationWarning
    >
      {/* Inline, to beat globals.css's unlayered body background: the host page shows through. */}
      <body className="no-grain antialiased" style={{ background: "transparent", minHeight: 0 }}>
        {children}
      </body>
    </html>
  );
}
