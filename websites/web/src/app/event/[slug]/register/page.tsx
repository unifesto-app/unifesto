import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getRegistrationForm as fetchForm } from "@/lib/api/registration";
import { getTenant } from "@/lib/tenant";
import RegisterClient from "./RegisterClient";

// One fetch per request, shared by generateMetadata and the page.
const getRegistrationForm = cache(fetchForm);

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const form = await getRegistrationForm(slug);
  return {
    title: form ? `Register for ${form.event.title}` : "Register",
    robots: { index: false, follow: false },
  };
}

/**
 * Free registration on the web (K10 slice 1). Free, individual tickets
 * register here with an email code; paid and group tickets still hand off
 * to the app (see RegisterClient).
 */
export default async function RegisterPage({ params }: Props) {
  const { slug } = await params;
  const form = await getRegistrationForm(slug);
  // Same public rule as the event page.
  if (!form || form.event.status === "DRAFT" || form.event.visibility === "SPACE_ONLY") notFound();
  const tenant = await getTenant();
  if (tenant && (form.event.space?.slug ?? form.event.organization?.slug) !== tenant.spaceSlug) notFound();
  return <RegisterClient {...form} />;
}
