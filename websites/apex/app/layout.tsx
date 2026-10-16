import type { Metadata } from "next";
import { Michroma, Hanken_Grotesk, Martian_Mono } from "next/font/google";
import "./globals.css";

// Cosmos type, same as unifesto.app: Michroma for titles, Hanken for UI.
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
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${michroma.variable} ${hanken.variable} ${martian.variable} font-sans antialiased min-h-full flex flex-col`}
      >
        {children}
      </body>
    </html>
  );
}
