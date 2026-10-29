import AssistStart from "./AssistStart";

/** ?registrationId= or ?eventId= ties the request to a ticket or event, as the app's ticket page does. */
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ registrationId?: string; eventId?: string }> }) {
  const { registrationId, eventId } = await searchParams;
  return <AssistStart registrationId={typeof registrationId === "string" ? registrationId : undefined} eventId={typeof eventId === "string" ? eventId : undefined} />;
}
