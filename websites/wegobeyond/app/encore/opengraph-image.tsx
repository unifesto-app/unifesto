import { OG_SIZE, shareCard } from "@/lib/og";

// Encore's share card, drawn like the initiative cards.
export const alt = "Unifesto Encore on WeGoBeyond";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function EncoreImage() {
  return shareCard({
    note: "Campus programme",
    title: "Unifesto Encore.",
    foot: "One student per campus helps every club run its events on Unifesto.",
    corner: "wordmark",
  });
}
