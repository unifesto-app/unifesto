/** An event can sit in up to this many categories; the first is its primary. */
export const MAX_EVENT_CATEGORIES = 3;

const clean = (list: (string | null | undefined)[]) => {
  const seen = new Set<string>();
  return list
    .map((c) => c?.trim() ?? '')
    .filter((c) => c && !seen.has(c) && seen.add(c))
    .slice(0, MAX_EVENT_CATEGORIES);
};

/**
 * What to write for `category` (primary, kept for every client that shows one)
 * and `categories` (the full list). New clients send `categories`; older ones
 * still send a single `category`, which replaces only the primary so the extra
 * picks survive. Returns {} when the request doesn't touch categories.
 */
export function resolveCategories(
  dto: { category?: string | null; categories?: string[] },
  existing?: { category: string | null; categories: string[] },
): { category?: string | null; categories?: string[] } {
  if (dto.categories !== undefined) {
    const categories = clean(dto.categories);
    return { categories, category: categories[0] ?? null };
  }
  if (dto.category !== undefined) {
    const primary = dto.category?.trim() || null;
    // Single-category clients resend the primary on every save.
    if (existing && primary === existing.category) return {};
    if (!primary) return { category: null, categories: [] };
    const categories = clean([primary, ...(existing?.categories ?? []).slice(1)]);
    return { categories, category: primary };
  }
  return {};
}
