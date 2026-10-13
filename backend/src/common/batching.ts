/**
 * Fan-out helpers: read a big recipient list a page at a time, and send with a
 * bounded number in flight, so a large event neither loads every row at once
 * nor fires thousands of emails in the same tick.
 */

/** Default page size for recipient reads. */
export const PAGE_SIZE = 500;
/** Default number of sends in flight at once. */
export const SEND_CONCURRENCY = 25;

/**
 * Keyset-paginate by `id`: `fetch` receives Prisma paging args to spread into
 * its findMany, and `fn` runs once per non-empty page.
 */
export async function forEachPage<T extends { id: string }>(
  fetch: (page: {
    take: number;
    orderBy: { id: 'asc' };
    cursor?: { id: string };
    skip?: number;
  }) => Promise<T[]>,
  fn: (rows: T[]) => Promise<void>,
  take = PAGE_SIZE,
): Promise<void> {
  let after: string | undefined;
  for (;;) {
    const rows = await fetch({
      take,
      orderBy: { id: 'asc' },
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    });
    if (rows.length === 0) return;
    await fn(rows);
    if (rows.length < take) return;
    after = rows[rows.length - 1].id;
  }
}

/**
 * Run `fn` over `items`, at most `size` at a time. One failure never stops the
 * rest (callers log their own errors).
 */
export async function inChunks<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>,
  size = SEND_CONCURRENCY,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.allSettled(items.slice(i, i + size).map(fn));
  }
}
