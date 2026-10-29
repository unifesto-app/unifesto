import { notFound } from "next/navigation";

/**
 * There is no app/layout.tsx (public and console each have their own root
 * layout), so an unmatched URL lands here to get this group's not-found page.
 * Metadata throws too, or the tab keeps the site's default title.
 */
export function generateMetadata(): never {
  notFound();
}

export default function Missing() {
  notFound();
}
