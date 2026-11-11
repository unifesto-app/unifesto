import { OG_SIZE, shareCard } from "@/lib/og";
import { getContent } from "@/lib/site";

// The site's share card: the hero wordmark and line. Pages without their own card use it.
export const alt = "wegobeyond. Workshops, meetups and hackathons for people who build.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpengraphImage() {
  const { heroLead } = await getContent();
  return shareCard({ title: "wego", rust: "beyond.", foot: heroLead, corner: "address" });
}
