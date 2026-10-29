import type { Metadata } from "next";
import { headers } from "next/headers";
import TicketsClient from "./TicketsClient";

export const metadata: Metadata = {
  title: "My tickets",
  robots: { index: false, follow: false },
};

export default async function TicketsPage() {
  // K14: this request's CSP nonce, for Razorpay's checkout.js (paying for a waiting-list spot).
  return <TicketsClient nonce={(await headers()).get("x-nonce") ?? undefined} />;
}
