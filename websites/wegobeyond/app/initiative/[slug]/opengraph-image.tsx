import { notFound } from "next/navigation";
import { OG_SIZE, shareCard } from "@/lib/og";
import { getContent } from "@/lib/site";

// Each initiative's share card: its format in rust, its name, its one line.
export const alt = "A WeGoBeyond initiative";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function InitiativeImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const it = (await getContent()).initiatives.find((i) => i.slug === slug);
  if (!it) notFound();
  return shareCard({ note: it.note, title: it.name, foot: it.body, corner: "wordmark" });
}
