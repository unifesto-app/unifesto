import type { Metadata } from "next";

// Personal seat-claim links: never indexed.
export const metadata: Metadata = {
  title: "Claim your seat",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
