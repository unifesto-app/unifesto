import type { Metadata } from "next";

// Two-minute sign-in codes: never indexed.
export const metadata: Metadata = {
  title: "Sign in with the app",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
