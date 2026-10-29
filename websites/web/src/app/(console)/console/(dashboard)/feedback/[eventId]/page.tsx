import type { Metadata } from "next";
import FeedbackClient from "./FeedbackClient";

export const metadata: Metadata = {
  title: "Feedback",
  robots: { index: false, follow: false },
};

export default async function FeedbackPage({ params }: { params: Promise<{ eventId: string }> }) {
  return <FeedbackClient eventId={(await params).eventId} />;
}
