import type { Metadata } from "next";

// Account flow: never indexed.
export const metadata: Metadata = {
  title: "Sign up",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
