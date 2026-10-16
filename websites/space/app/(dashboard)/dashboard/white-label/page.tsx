import { redirect } from "next/navigation";

// Branding moved under Settings (X7); keep old bookmarks working.
export default function WhiteLabelRedirect() {
  redirect("/dashboard/settings/branding");
}
