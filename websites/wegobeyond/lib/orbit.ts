// Unifesto Encore, Unifesto's campus programme, on /encore. It was Unifesto Orbit until
// 14 Nov 2026; identifiers, the API routes and the orbit@ inbox keep the old name.
// The programme is Unifesto's: Leads sign its terms with Unifesto Private Limited and
// apply with a Unifesto account, so Apply and the terms link back to unifesto.app. These
// facts mirror the programme terms (Unifesto Apex › Legal › orbit-terms) and change only
// with them, so they live in code.
import { UNIFESTO } from "@/lib/site";

const UNIFESTO_WEB = "https://www.unifesto.app";

export const ORBIT = {
  apply: `${UNIFESTO_WEB}/encore/apply`,
  terms: `${UNIFESTO_WEB}/encore/terms`,
  inbox: "orbit@unifesto.app",
} as const;

export const ORBIT_STEPS = [
  { title: "Map", body: "Make a list of every club on your campus." },
  { title: "Onboard", body: "Each club creates its Space on Unifesto and joins your campus." },
  { title: "Activate", body: "The club publishes its first event. That makes it an active club." },
  { title: "Support", body: "Be the first help for organisers on your campus." },
] as const;

/** `count` is the bar's number: clubs onboarded for Lead, active clubs after that. */
export const ORBIT_TIERS = [
  { name: "Lead", count: 2, bar: "clubs onboarded in your first 30 days", rewards: ["Encore certificate", "Encore badge", "The Lead welcome kit"] },
  { name: "Bronze", count: 5, bar: "active clubs", rewards: ["Letter of recommendation signed by the founder", "A feature on Unifesto’s socials"] },
  { name: "Silver", count: 10, bar: "active clubs and 1 paid event", rewards: ["Free Pro plan for your own club", "A limited-edition hoodie every quarter"] },
  { name: "Gold", count: 15, bar: "active clubs, or bring your fest onto Unifesto", rewards: ["Fast-track interview for a paid internship", "A shot at Encore Lead of the Year", "A limited-edition hoodie every quarter"] },
] as const;

export const ORBIT_RULES = [
  "Never say you represent your college. You represent Unifesto.",
  "Never collect money outside Unifesto.",
  "No fake clubs or events.",
  "No spam.",
  // Mirrors terms clause 16 (disclosure), which still names Orbit. Change it only when a terms
  // version under the Encore name is published.
  "When you post about Unifesto, say you’re an Orbit Lead and tag #UnifestoOrbit.",
] as const;

export const ORBIT_KITS = [
  {
    name: "Lead edition",
    when: "Lands at your door once you pass your first 30 days.",
    items: ["Encore hoodie", "The Encore Playbook", "A signed welcome letter", "A sticker pack", "Pins, a phone grip and a keychain"],
  },
  {
    name: "Crew edition",
    when: "For the 2 to 3 Crew who help a Lead on a big campus, once their Lead passes 30 days.",
    items: ["Encore tee", "A signed welcome letter", "A sticker pack", "Pins and a keychain"],
  },
] as const;

export const ORBIT_FAQ = [
  { q: "Is this paid?", a: "No. Encore rewards are recognition, not cash. Top Leads get a fast-track interview for a paid internship." },
  { q: "Do I need to be in a club?", a: "Yes. You should be active in a club or fest team on your campus. That is where the work starts." },
  { q: "Can two people from one college apply?", a: "There is one Encore Lead per campus. Big campuses can have 2 to 3 Crew working with the Lead. Crew get the Crew kit and an Encore certificate, with no targets or tiers of their own." },
  { q: "What if my college is not on Unifesto yet?", a: "Apply anyway. We create the campus Space." },
  { q: "What happens during exams?", a: "Take a break. Tell your Program Lead before you go and pick up again after." },
  { q: "How much time does it take?", a: "There are no fixed hours and it is fully remote. In the first 30 days the goal is 2 clubs onboarded. After that there is no end date: you stay as long as you are active." },
] as const;

export type OrbitCity = { city: string; lon: number; lat: number; colleges: { name: string; count: number }[] };
export type OrbitMap = { totals: { applications: number; cities: number; colleges: number }; cities: OrbitCity[] };

/** The map stays hidden until it has something to show. */
export const MAP_MIN_APPLICATIONS = 10;

/**
 * Where Encore applications come from, live from Unifesto (cached there for 5 minutes).
 * Null when Unifesto can't be read: the map section hides, the rest of the page stands.
 */
export async function getOrbitMap(): Promise<OrbitMap | null> {
  try {
    const res = await fetch(`${UNIFESTO.api}/orbit/application-map`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as OrbitMap;
    // A payload of the wrong shape would throw mid-render, so it counts as no map.
    const ok =
      typeof d?.totals?.applications === "number" &&
      Array.isArray(d.cities) &&
      d.cities.every((c) => Number.isFinite(c?.lon) && Number.isFinite(c?.lat) && Array.isArray(c.colleges));
    return ok ? d : null;
  } catch {
    return null;
  }
}
