import { redirect } from "next/navigation";

// Partners moved into Tracking (X7); keep old links working.
export default async function PartnersRedirect({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/dashboard/events/${eventId}/tracking`);
}
