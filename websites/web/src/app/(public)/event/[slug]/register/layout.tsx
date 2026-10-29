import type { Metadata } from "next";

// Registration flow pages: never indexed.
export const metadata: Metadata = {
  title: "Registration",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
