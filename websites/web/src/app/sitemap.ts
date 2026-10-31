import { MetadataRoute } from 'next'
import { getAllEvents } from '@/lib/api/events'
import { getAllSpaces } from '@/lib/api/spaces'
import { getPosts } from '@/lib/api/blog'
import { getHelpArticles } from '@/lib/api/help'
import { getOpenRoles } from '@/lib/api/careers'
import { SITE } from '@/lib/site'

const baseUrl = SITE.url

// Regenerate the sitemap hourly so newly published events/spaces get indexed
// without a redeploy. The fetches below make this a dynamic sitemap; without a
// revalidate window Next would cache it at build time and it would go stale.
export const revalidate = 3600

/**
 * Every public top-level event, upcoming and past, as `/event/[slug]` entries.
 * Past events stay indexed (their pages are real and carry the space's
 * history), just at a lower priority than upcoming ones. A white-labelled
 * event is left out: its canonical is the space's own domain, whose sitemap
 * lists it (src/app/(public)/space/[spaceSlug]/sitemap.xml).
 */
async function getEventRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const [upcoming, past] = await Promise.all([getAllEvents('upcoming'), getAllEvents('past')])
    const now = Date.now()

    return [...upcoming, ...past]
      .filter((e) => Boolean(e.slug) && !e.custom_domain)
      .map((e) => {
        const ended = new Date(e.end_date || e.start_date).getTime() < now
        return {
          url: `${baseUrl}/event/${e.slug}`,
          lastModified: e.updated_at ? new Date(e.updated_at) : new Date(),
          changeFrequency: ended ? ('monthly' as const) : ('daily' as const),
          priority: ended ? 0.5 : 0.9,
        }
      })
  } catch {
    // Never let a backend hiccup break the whole sitemap — fall back to the
    // static routes only.
    return []
  }
}

/**
 * Every listed public space as a `/space/[slug]` entry, except white-labelled
 * ones (their own domain's sitemap has them). Sub-spaces stay in: they have
 * their own pages, just not a /spaces card.
 */
async function getSpaceRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const spaces = await getAllSpaces()

    return spaces
      .filter((s) => Boolean(s.slug) && !s.custom_domain)
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

/** Every open role. getOpenRoles() already returns [] on failure. */
async function getCareerRoutes(): Promise<MetadataRoute.Sitemap> {
  const roles = await getOpenRoles()
  return roles.map((r) => ({
    url: `${baseUrl}/careers/${r.id}`,
    lastModified: new Date(r.created_at),
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }))
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
    page('/orbit', 'weekly', 0.7),
    page('/orbit/apply', 'weekly', 0.6),
    page('/orbit/terms', 'yearly', 0.3),
    page('/pricing', 'monthly', 0.9),
    page('/events', 'daily', 0.9),
    page('/spaces', 'weekly', 0.8),
    page('/request-space', 'monthly', 0.7),
    page('/request-event', 'monthly', 0.6),
    page('/about', 'monthly', 0.7),
    page('/press', 'monthly', 0.5),
    page('/support', 'monthly', 0.6),
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

  const [eventRoutes, spaceRoutes, blogRoutes, helpRoutes, careerRoutes] = await Promise.all([
    getEventRoutes(),
    getSpaceRoutes(),
    getBlogRoutes(),
    getHelpRoutes(),
    getCareerRoutes(),
  ])

  // K17, K11: /help, /blog and /careers 404 while empty, so list each only
  // once it has something in it.
  const sectionIndexes = [
    ...(helpRoutes.length ? [page('/help', 'weekly', 0.6)] : []),
    ...(blogRoutes.length ? [page('/blog', 'weekly', 0.7)] : []),
    ...(careerRoutes.length ? [page('/careers', 'weekly', 0.6)] : []),
  ]

  return [...staticRoutes, ...sectionIndexes, ...eventRoutes, ...spaceRoutes, ...blogRoutes, ...helpRoutes, ...careerRoutes]
}
