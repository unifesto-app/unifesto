import type { Metadata } from "next";
import TicketClient from "./TicketClient";

export const metadata: Metadata = {
  title: "My ticket",
  robots: { index: false, follow: false },
};

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  return <TicketClient id={(await params).id} />;
}
