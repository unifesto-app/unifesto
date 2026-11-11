import { LINKS, ORG, SITE_URL, UNIFESTO, getContent } from "@/lib/site";
import { formatWhen, getUpcomingEvents } from "@/lib/events";
import { ORBIT } from "@/lib/orbit";

// /llms.txt (llmstxt.org): WeGoBeyond in plain Markdown for chat assistants, built from
// the same Unifesto content and live events as the site, so it never goes stale.
// Route handlers render per request unless given this; 60s matches the content cache.
export const revalidate = 60;

export async function GET() {
  const [c, events] = await Promise.all([getContent(), getUpcomingEvents()]);
  const link = (label: string, url: string, note = "") => `- [${label}](${url})${note ? `: ${note}` : ""}`;

  const text = [
    "# WeGoBeyond",
    "",
    `> ${c.heroLead} WeGoBeyond is an initiative of Unifesto, run by ${ORG.legalName} in ${ORG.location}. Every event is listed, and registered for, on Unifesto.`,
    "",
    `Website: ${SITE_URL}`,
    `Partnerships (sponsors, venues, communities): ${c.partnersInbox}`,
    `Support and general questions: ${c.supportInbox}`,
    "",
    "## Initiatives",
    "",
    ...c.initiatives.map((i) => link(i.name, `${SITE_URL}/initiative/${i.slug}`, `${i.note}. ${i.body}`)),
    "",
    "## Unifesto Orbit",
    "",
    link("Unifesto Orbit", `${SITE_URL}/orbit`, "Unifesto's campus programme: one Orbit Lead per campus helps every club run its events on Unifesto. Rewards are recognition, not cash"),
    link("Apply to be an Orbit Lead", ORBIT.apply, "with a Unifesto account"),
    link("Orbit Lead Programme Terms", ORBIT.terms),
    "",
    "## Events",
    "",
    link("All WeGoBeyond events on Unifesto", LINKS.whatsOn, "dates, venues, tickets and registration"),
    ...(events ?? []).map((e) =>
      link(e.title, UNIFESTO.eventUrl(e.slug), [formatWhen(e), e.place].filter(Boolean).join(", "))
    ),
    ...(events && events.length === 0 ? ["- Nothing is open for registration right now; new dates go up on Unifesto first."] : []),
    "",
    "## Get involved",
    "",
    link("Partner with WeGoBeyond", `mailto:${c.partnersInbox}`, "put a brand, venue or community in front of the people who build"),
    link("Join the crew", `${SITE_URL}/volunteer`, "volunteer, speak, mentor or host"),
    ...(c.community ? [link("The WeGoBeyond WhatsApp community", c.community, "event news, crew calls and Orbit Leads, in one place")] : []),
    ...(c.support ? [link("Back the community", c.support, "chip in any amount, paid through Razorpay")] : []),
    link("The crew", `${SITE_URL}/crew`, "the people who make the rooms happen"),
    "",
    "## Press",
    "",
    `About WeGoBeyond (free to use as written): ${c.boilerplate}`,
    `Press contact: ${c.pressEmail}`,
    "",
    ...c.releases.map((r) => `- ${r.date}: ${r.title}. ${r.body}`),
    "",
    "## Optional",
    "",
    ...c.socials.flatMap((g) => g.accounts.map((a) => link(`${g.brand} on ${a.label}`, a.href))),
    ...c.policies.map((p) => link(p.label, p.href, "Unifesto's policy, which applies to WeGoBeyond")),
    "",
  ].join("\n");

  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
