import type { Metadata } from "next";
import { headers } from "next/headers";
import { DM_Sans, Hanken_Grotesk, Martian_Mono } from "next/font/google";
// The console's own root layout and stylesheet (Track V): public pages never load
// console.css and the console never loads globals.css. Crossing is a full page load.
import "./console.css";

// Cosmos type, same as unifesto.app: DM Sans for titles, Hanken for UI.
// Headlines. Variable weight + optical size; latin-ext carries the ₹, which
// Hanken lacks, so body text borrows that one glyph from here.
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  display: "swap",
});

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  display: "swap",
});

const martian = Martian_Mono({
  variable: "--font-martian",
  preload: false,
  subsets: ["latin"],
  display: "swap",
});

/* Stored choice (system | light | dark) → data-pref on <html>, resolved one →
   data-theme, before first paint; System tracks OS changes live. Same as web. */
const themeScript = `try{var r=document.documentElement,m=matchMedia("(prefers-color-scheme: light)");window.__applyTheme=function(){var p=localStorage.getItem("theme")||"system";r.dataset.pref=p;r.dataset.theme=p==="system"?(m.matches?"light":"dark"):p};__applyTheme();m.addEventListener("change",__applyTheme)}catch(e){}`;

export const metadata: Metadata = {
  title: "Unifesto Console",
  description:
    "Run your space on Unifesto — plan, members, events and money, in one operator console.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP nonce from proxy.ts (J17); reading headers() also makes every page
  // render per request, which nonces need.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${dmSans.variable} ${hanken.variable} ${martian.variable} font-sans antialiased min-h-full flex flex-col`}
      >
        {children}
      </body>
    </html>
  );
}
