import type { Metadata } from "next";
import TicketsClient from "./TicketsClient";

export const metadata: Metadata = {
  title: "My tickets",
  robots: { index: false, follow: false },
};

export default function TicketsPage() {
  return <TicketsClient />;
}
