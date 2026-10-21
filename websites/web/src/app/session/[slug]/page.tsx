import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarBlank, Clock, Users, VideoCamera } from "@unifesto/unicon/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ActionBar, Avatar, Block, Card, FactRow, ReadMore } from "@/components/DetailParts";
import { optimized } from "@/lib/img";
import { withSocial } from "@/lib/seo";
import { getSessionBySlug as fetchSession, sessionPrice, sessionWhen } from "@/lib/api/sessions";
import OpenSessionButton from "./OpenSessionButton";

// One fetch per request, shared by generateMetadata and the page.
const getSessionBySlug = cache(fetchSession);

interface Props {
  params: Promise<{ slug: string }>;
}

/** Over: marked completed, or past its scheduled end (start + duration). */
function hasEnded(s: { status: string; startDateTime: string; durationMinutes: number }): boolean {
  return s.status === "COMPLETED" || new Date(s.startDateTime).getTime() + s.durationMinutes * 60_000 < Date.now();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = await getSessionBySlug(slug);
  if (!s) return { title: "Session not found", robots: { index: false } };
  const description = `${sessionWhen(s)} · ${sessionPrice(s)} · online${s.space ? ` · by ${s.space.name}` : ""}`;
  return withSocial(
    { title: s.title, description, alternates: { canonical: `/session/${s.slug}` } },
    { title: s.title, description, image: false },
  );
}

/**
 * Public page for one Huddle session (B18). Reminder emails and share links
 * point here; on a phone with the app, the universal link opens the app's
 * session screen instead. Registration, payment and the room are in the app.
 */
export default async function SessionPage({ params }: Props) {
  const { slug } = await params;
  const s = await getSessionBySlug(slug);
  if (!s) notFound();

  const ended = hasEnded(s);
  const cancelled = s.status === "CANCELLED";
  const full = s.capacity != null && s.registeredCount >= s.capacity;

  return (
    <main className="min-h-screen bg-canvas pb-28">
      <Navbar />
      <div className="mx-auto max-w-3xl px-5 pt-28 sm:px-8 md:pt-32">
        {s.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={optimized(s.coverImageUrl, 1080)}
            alt=""
            className="aspect-[4/3] w-full rounded-3xl bg-night-2 object-cover"
          />
        )}
        <p className="mt-6 text-sm text-paper/60">Unifesto Huddle · online session</p>
        <h1 className="mt-1 font-display text-3xl text-paper sm:text-4xl">{s.title}</h1>
        {cancelled && (
          <p className="mt-3 text-sm text-destructive">
            This session was cancelled{s.cancellationReason ? `: ${s.cancellationReason}` : "."}
          </p>
        )}

        <Card className="mt-6">
          <FactRow icon={<CalendarBlank className="h-5 w-5 text-paper/70" />} title={sessionWhen(s)} sub={s.timezone} />
          <FactRow icon={<Clock className="h-5 w-5 text-paper/70" />} title={`${s.durationMinutes} minutes`} />
          <FactRow
            icon={<VideoCamera className="h-5 w-5 text-paper/70" />}
            title="Online"
            sub="Join from the Unifesto app. There's no link to forward."
          />
          {s.capacity != null && (
            <FactRow
              icon={<Users className="h-5 w-5 text-paper/70" />}
              title={full ? "Full" : `${s.capacity - s.registeredCount} of ${s.capacity} places left`}
            />
          )}
        </Card>

        {s.description && (
          <Block title="About">
            <ReadMore text={s.description} />
          </Block>
        )}

        {s.space && (
          <Block title="Hosted by">
            <Link href={`/space/${s.space.slug}`} className="flex items-center gap-3">
              <Avatar src={s.space.logoUrl} name={s.space.name} />
              <span className="text-[15px] font-semibold text-paper">{s.space.name}</span>
            </Link>
          </Block>
        )}
      </div>
      <Footer />

      {!cancelled && (
        <ActionBar label={ended ? "This session has ended" : full ? "No places left" : "Price"} value={ended || full ? s.title : sessionPrice(s)}>
          <OpenSessionButton slug={s.slug} label={ended ? "Open in app" : "Register in app"} />
        </ActionBar>
      )}
    </main>
  );
}
