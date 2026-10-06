import { ImageResponse } from "next/og";
import { getEventBySlug } from "@/lib/api/events";
import { OG_SIZE, OgCard, fetchImageAsDataUrl, loadOgBase } from "@/lib/og";

export const alt = "Event on Unifesto";
export const size = OG_SIZE;
export const contentType = "image/png";
// ISR: the first crawler renders the card, everyone after gets the cached PNG.
export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(d);
}

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const event = await getEventBySlug(slug).catch(() => null);

  const [image, base] = await Promise.all([
    fetchImageAsDataUrl(event?.banner_url ?? event?.image_url),
    loadOgBase(),
  ]);

  const host = event?.space?.name ?? event?.organization?.name ?? null;
  const online = /online|virtual/i.test(event?.event_type ?? "");
  const cityState = [event?.city, event?.state].filter(Boolean).join(", ");
  const place = online ? "Online" : event?.venue || cityState || null;

  return new ImageResponse(
    (
      <OgCard
        wordmark={base.wordmark}
        kind="Event"
        title={event?.title ?? "Event on Unifesto"}
        subtitle={host ? `Hosted by ${host}` : null}
        meta={[formatDate(event?.start_date), place]}
        // Same wording as the app: free events RSVP, paid events register.
        cta={event ? (event.is_free ? "RSVP" : "Register") : undefined}
        image={image}
      />
    ),
    { ...size, fonts: base.fonts },
  );
}
