import { INDIA_PATH, INDIA_STATES_PATH, INDIA_VIEWBOX, indiaPoint } from "@/lib/india-outline";
import type { OrbitCity } from "@/lib/orbit";

const count = (c: OrbitCity) => c.colleges.reduce((n, k) => n + k.count, 0);
// Square root, capped, so a big city never drowns the rest.
const radius = (n: number) => Math.min(26, 7 + 3 * Math.sqrt(n));

// India with a rust dot per city that has Encore applications. Static: the city list
// beside it carries the same numbers, so nothing here needs hover.
export default function OrbitMap({ cities }: { cities: OrbitCity[] }) {
  const { width, height } = INDIA_VIEWBOX;
  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Map of India with a dot for each city Encore applications come from">
        <path d={INDIA_PATH} className="fill-ink-2 stroke-line" strokeWidth="3" strokeLinejoin="round" />
        <path d={INDIA_STATES_PATH} fill="none" className="stroke-line" strokeWidth="1.5" strokeLinejoin="round" />
        {cities.map((c) => {
          const { x, y } = indiaPoint(c.lon, c.lat);
          return <circle key={c.city} cx={x} cy={y} r={radius(count(c))} className="fill-rust" />;
        })}
      </svg>
      {/* The outline's licence asks for this credit. */}
      <figcaption className="caption mt-3 text-silver">Boundaries: DataMeet (CC BY 4.0)</figcaption>
    </figure>
  );
}

export { count as cityCount };
