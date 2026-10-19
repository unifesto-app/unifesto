import { MetadataRoute } from 'next'
import { getListedEvents } from '@/lib/api/events'
import { getSpaces } from '@/lib/api/spaces'
import { getPosts } from '@/lib/api/blog'
import { getHelpArticles } from '@/lib/api/help'
import { SITE } from '@/lib/site'

const baseUrl = SITE.url

// Regenerate the sitemap hourly so newly published events/spaces get indexed
// without a redeploy. The fetches below make this a dynamic sitemap; without a
// revalidate window Next would cache it at build time and it would go stale.
export const revalidate = 3600

/**
 * Every public top-level event the /events page lists, upcoming and past, as
 * `/event/[slug]` entries. Past events stay indexed (their pages are real and
 * carry the space's history), just at a lower priority than upcoming ones.
 */
async function getEventRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const events = await getListedEvents()
    const now = Date.now()

    return events
      .filter((e) => Boolean(e.slug))
      .map((e) => {
        const past = new Date(e.end_date || e.start_date).getTime() < now
        return {
          url: `${baseUrl}/event/${e.slug}`,
          lastModified: e.updated_at ? new Date(e.updated_at) : new Date(),
          changeFrequency: past ? ('monthly' as const) : ('daily' as const),
          priority: past ? 0.5 : 0.9,
        }
      })
  } catch {
    // Never let a backend hiccup break the whole sitemap — fall back to the
    // static routes only.
    return []
  }
}

/**
 * Fetch the ACTIVE public spaces and turn each into a `/space/[slug]` sitemap
 * entry. Sub-spaces stay in: they have their own pages, just not a /spaces card.
 */
async function getSpaceRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const { spaces } = await getSpaces(1, 200, { is_active: true })

    return spaces
      .filter((s) => Boolean(s.slug))
      .map((s) => ({
        url: `${baseUrl}/space/${s.slug}`,
        lastModified: s.updated_at ? new Date(s.updated_at) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }))
  } catch {
    return []
  }
}

/** Every published blog post. getPosts() already returns [] on failure. */
async function getBlogRoutes(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts()
  return posts.map((p) => ({
    url: `${baseUrl}/blog/${p.slug}`,
    lastModified: new Date(p.updatedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))
}

/** Every published help article. getHelpArticles() already returns [] on failure. */
async function getHelpRoutes(): Promise<MetadataRoute.Sitemap> {
  const articles = await getHelpArticles()
  return articles.map((a) => ({
    url: `${baseUrl}/help/${a.slug}`,
    lastModified: new Date(a.updatedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const currentDate = new Date()

  // Public, indexable pages only. Private and transactional routes
  // (/profile, /signup, /claim, /download, register flows) are excluded and
  // disallowed in robots.ts.
  const page = (
    path: string,
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'],
    priority: number,
  ) => ({ url: `${baseUrl}${path}`, lastModified: currentDate, changeFrequency, priority })

  const staticRoutes: MetadataRoute.Sitemap = [
    page('', 'daily', 1),
    page('/organisers', 'weekly', 0.9),
    page('/app', 'weekly', 0.9),
    page('/sprint', 'weekly', 0.9),
    page('/stay', 'weekly', 0.8),
    page('/huddle', 'weekly', 0.8),
    page('/pricing', 'monthly', 0.9),
    page('/events', 'daily', 0.9),
    page('/spaces', 'weekly', 0.8),
    page('/request-space', 'monthly', 0.7),
    page('/request-event', 'monthly', 0.6),
    page('/about', 'monthly', 0.7),
    page('/blog', 'weekly', 0.7),
    page('/careers', 'weekly', 0.6),
    page('/press', 'monthly', 0.5),
    page('/support', 'monthly', 0.6),
    page('/help', 'weekly', 0.6),
    page('/privacy', 'yearly', 0.3),
    page('/terms', 'yearly', 0.3),
    page('/refund', 'yearly', 0.3),
    page('/privacy-notice', 'yearly', 0.3),
    page('/cookies', 'yearly', 0.3),
    page('/code-of-conduct', 'yearly', 0.3),
    page('/data-rights', 'yearly', 0.3),
    page('/privacy-requests', 'yearly', 0.3),
    page('/subprocessors', 'yearly', 0.3),
    page('/grievance', 'yearly', 0.3),
    page('/security', 'yearly', 0.3),
    page('/delete-account', 'yearly', 0.2),
  ]

  const [eventRoutes, spaceRoutes, blogRoutes, helpRoutes] = await Promise.all([
    getEventRoutes(),
    getSpaceRoutes(),
    getBlogRoutes(),
    getHelpRoutes(),
  ])

  return [...staticRoutes, ...eventRoutes, ...spaceRoutes, ...blogRoutes, ...helpRoutes]
}
