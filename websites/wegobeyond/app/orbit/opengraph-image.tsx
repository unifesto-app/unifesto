import { OG_SIZE, shareCard } from "@/lib/og";

// Orbit's share card, drawn like the initiative cards.
export const alt = "Unifesto Orbit on WeGoBeyond";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OrbitImage() {
  return shareCard({
    note: "Campus programme",
    title: "Unifesto Orbit.",
    foot: "One student per campus helps every club run its events on Unifesto.",
    corner: "wordmark",
  });
}
