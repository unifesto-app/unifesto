import type { Metadata } from "next";
import DetailsClient from "./DetailsClient";

export const metadata: Metadata = {
  title: "My details",
  robots: { index: false, follow: false },
};

export default async function DetailsPage({ params }: { params: Promise<{ id: string }> }) {
  return <DetailsClient id={(await params).id} />;
}
