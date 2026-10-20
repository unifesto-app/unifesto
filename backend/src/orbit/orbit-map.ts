import { findIndianCity } from './india-cities';

/** Colleges with fewer applications than this are folded into "Other colleges",
 *  so a single applicant can't be singled out on a public map. */
export const ORBIT_MAP_MIN_NAMED = 3;
/** Statuses that count: open and appointed. Declined applications don't. */
export const ORBIT_MAP_STATUSES = ['PENDING', 'APPOINTED'] as const;

export type OrbitMapRow = { collegeName: string; space: { name: string; city: string | null } | null };

export type OrbitMap = {
  totals: { applications: number; cities: number; colleges: number };
  cities: { city: string; lon: number; lat: number; colleges: { name: string; count: number }[] }[];
};

/**
 * Public, aggregate-only view of Orbit applications. Placed by the campus
 * Space's city; applications without a known campus city only count in the
 * totals. No names, emails or ids leave this function.
 */
export function aggregateOrbitMap(rows: OrbitMapRow[]): OrbitMap {
  const colleges = new Set<string>();
  const byCity = new Map<string, { city: string; lon: number; lat: number; counts: Map<string, number> }>();

  for (const r of rows) {
    const college = (r.space?.name ?? r.collegeName).trim();
    colleges.add(college.toLowerCase());
    const place = findIndianCity(r.space?.city);
    if (!place) continue;
    const entry = byCity.get(place.city) ?? { ...place, counts: new Map<string, number>() };
    entry.counts.set(college, (entry.counts.get(college) ?? 0) + 1);
    byCity.set(place.city, entry);
  }

  const cities = [...byCity.values()].map(({ counts, ...place }) => {
    const named: { name: string; count: number }[] = [];
    let other = 0;
    for (const [name, count] of counts) {
      if (count >= ORBIT_MAP_MIN_NAMED) named.push({ name, count });
      else other += count;
    }
    named.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    if (other) named.push({ name: 'Other colleges', count: other });
    return { ...place, colleges: named };
  });

  return {
    totals: { applications: rows.length, cities: cities.length, colleges: colleges.size },
    cities,
  };
}
