import { Logger } from '@nestjs/common';

/* IndexNow (indexnow.org): tells Bing, Yandex, Seznam and Naver that a URL
   changed, so new pages are crawled in minutes instead of days. Bing's index
   feeds ChatGPT search and Copilot. The key is public by design: it is served
   at `${WEB_URL}/${INDEXNOW_KEY}.txt` (websites/web/public) to prove we own the
   host. Change both together. */
export const INDEXNOW_KEY = 'b8bf47e1628623527f649d2862d9a663';

const WEB_URL = () => (process.env.WEB_URL || 'https://www.unifesto.app').replace(/\/$/, '');
const logger = new Logger('IndexNow');

/** Absolute URL for a blog post slug. */
export const blogUrl = (slug: string) => `${WEB_URL()}/blog/${slug}`;

/**
 * URLs to report when a blog post changes. A post's URL counts while it is
 * PUBLISHED; report the old one if it was live (so a slug change or unpublish
 * is seen as a removal) and the new one if it is live now. The /blog index
 * goes with any change. Empty = nothing public changed.
 */
export function blogChangeUrls(
  before: { slug: string; status: string } | null,
  after: { slug: string; status: string } | null,
): string[] {
  const urls = new Set<string>();
  if (before?.status === 'PUBLISHED') urls.add(blogUrl(before.slug));
  if (after?.status === 'PUBLISHED') urls.add(blogUrl(after.slug));
  if (urls.size) urls.add(`${WEB_URL()}/blog`);
  return [...urls];
}

/**
 * Fire-and-forget ping. Production only, so local and staging edits never
 * announce prod URLs. Never throws: a failed ping only delays indexing.
 */
export function pingIndexNow(urls: string[]): void {
  if (!urls.length || process.env.NODE_ENV !== 'production') return;
  const host = new URL(WEB_URL()).host;
  fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: `${WEB_URL()}/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    }),
    signal: AbortSignal.timeout(5000),
  })
    .then((res) => {
      // 200 = accepted, 202 = accepted, key check pending.
      if (!res.ok) logger.warn(`IndexNow ${res.status} for ${urls.join(', ')}`);
    })
    .catch((err: Error) => logger.warn(`IndexNow failed: ${err.message}`));
}
