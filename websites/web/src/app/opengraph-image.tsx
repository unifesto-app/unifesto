import { ImageResponse } from "next/og";
import { OG_SIZE, OgCard, loadOgBase, readPublicAsDataUrl } from "@/lib/og";

// Site-wide default: every route without its own opengraph-image inherits this.
export const alt = "Unifesto: event ticketing, QR check-in and payouts for India";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const [base, symbol] = await Promise.all([loadOgBase(), readPublicAsDataUrl("press/symbol-silver.svg")]);
  return new ImageResponse(
    (
      <OgCard
        wordmark={base.wordmark}
        title="Run the whole event"
        subtitle="Not just the ticket page. Tickets, check-in, payouts and certificates in one Space."
        image={symbol}
        imageAspect="1:1"
        imageFit="contain"
        frame={false}
      />
    ),
    { ...size, fonts: base.fonts },
  );
}
