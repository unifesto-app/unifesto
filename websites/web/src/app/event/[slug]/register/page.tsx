import { redirect } from "next/navigation";

/**
 * Registration is mobile-only. The web app no longer hosts a registration flow
 * (the previous form here was an unwired mock). Anyone landing on this URL is
 * sent back to the event page, whose primary CTA opens the Unifesto app.
 */
export default async function RegisterRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/event/${slug}`);
}
