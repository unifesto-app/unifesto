import { ImageResponse } from "next/og";
import { getEventBySlug } from "@/lib/api/events";
import { OG_SIZE, OgCard, fetchImageAsDataUrl, loadOgFonts, readPublicPngAsDataUrl } from "@/lib/og";

export const alt = "Event on Unifesto";
export const size = OG_SIZE;
export const contentType = "image/png";
// Cache each generated card as an ISR asset: the first crawler renders it,
// everyone after gets the cached PNG.
export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(d);
}

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const event = await getEventBySlug(slug).catch(() => null);

  const [image, wordmark, fonts] = await Promise.all([
    fetchImageAsDataUrl(event?.banner_url ?? event?.image_url),
    readPublicPngAsDataUrl("UnifestoAppWordmark.png"),
    loadOgFonts(),
  ]);

  const title = event?.title ?? "Unifesto";
  const host = event?.space?.name ?? event?.organization?.name ?? null;
  const date = formatDate(event?.start_date);
  const cityState = [event?.city, event?.state].filter(Boolean).join(", ");
  const location = event?.venue ?? (cityState || null);

  return new ImageResponse(
    (
      <OgCard
        wordmark={wordmark}
        title={title}
        subtitle={host ? `Hosted by ${host}` : null}
        meta={[date, location].filter((x): x is string => Boolean(x))}
        // Match the app's wording: free events RSVP, paid events register.
        cta={event?.is_free ? "RSVP Now" : "Register Now"}
        image={image}
        imageAspect="4:3"
        imageFit="cover"
        monogram={(title[0] ?? "U").toUpperCase()}
      />
    ),
    { ...size, fonts },
  );
}
