import { MetadataRoute } from 'next'
import { getEvents } from '@/lib/api/events'
import { getSpaces } from '@/lib/api/spaces'

const baseUrl = 'https://unifesto.app'

// Regenerate the sitemap hourly so newly published events/spaces get indexed
// without a redeploy. The fetches below make this a dynamic sitemap; without a
// revalidate window Next would cache it at build time and it would go stale.
export const revalidate = 3600

/**
 * Fetch the public events that appear on the home page and turn the ones that
 * haven't ended yet into `/event/[slug]` sitemap entries. The backend `/events`
 * endpoint already restricts to PUBLISHED + PUBLIC + top-level events (the same
 * feed the home page renders); here we additionally drop anything already over,
 * so search engines only ever see live/upcoming events.
 */
async function getEventRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    // Match the home page, which fetches up to 100 events (EventsGrid).
    const { events } = await getEvents(1, 100)
    const now = Date.now()

    return events
      .filter((e) => {
        // Keep events that are ongoing or upcoming — i.e. their end (falling
        // back to start) is still in the future. Skip anything with no slug.
        if (!e.slug) return false
        const ends = new Date(e.end_date || e.start_date).getTime()
        return Number.isFinite(ends) && ends >= now
      })
      .map((e) => ({
        url: `${baseUrl}/event/${e.slug}`,
        lastModified: e.updated_at ? new Date(e.updated_at) : new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.9,
      }))
  } catch {
    // Never let a backend hiccup break the whole sitemap — fall back to the
    // static routes only.
    return []
  }
}

/**
 * Fetch the public spaces and turn each into a `/space/[slug]` sitemap entry.
 * The backend `/spaces` endpoint only ever returns APPROVED (public) spaces —
 * the same directory the `/spaces` page lists — so there's nothing extra to
 * filter beyond guarding against a missing slug.
 */
async function getSpaceRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const { spaces } = await getSpaces(1, 200)

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const currentDate = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/features`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/events`,
      lastModified: currentDate,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/host`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/spaces`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/careers`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: currentDate,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/support`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/auth`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/profile`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/refund`,
      lastModified: currentDate,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  const [eventRoutes, spaceRoutes] = await Promise.all([
    getEventRoutes(),
    getSpaceRoutes(),
  ])

  return [...staticRoutes, ...eventRoutes, ...spaceRoutes]
}
