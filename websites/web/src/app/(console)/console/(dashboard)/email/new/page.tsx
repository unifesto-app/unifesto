import { redirect } from "next/navigation";

// New sends moved to Campaigns (C17): one message as a notification, an email, or both.
export default function NewEmailRedirect() {
  redirect("/console/campaigns/new");
}
