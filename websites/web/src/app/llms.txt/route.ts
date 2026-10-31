import {
  APP_FEATURES,
  buyerFeeText,
  FAQ_HOME,
  pricingFaq,
  FAQ_STAY,
  FAQ_ORBIT, ORBIT_STEPS, ORBIT_TIERS,
  STAY_STEPS,
  HACKATHON_STAGES,
  PILLARS,
  PLANS,
  PROOF,
  SITE,
  planFeesText,
} from "@/lib/site";
import { getPosts } from "@/lib/api/blog";
import { getRateCard } from "@/lib/api/rate-card";

/* /llms.txt: a plain-language brief of Unifesto for AI assistants and
   answer engines (llmstxt.org format). Built from the same content source
   as the pages, so it can never drift from what the site says. Blog
   posts come from the API, so this regenerates hourly. */
export const revalidate = 3600;

const plan = (p: (typeof PLANS)[number]) =>
  `- ${p.name} (${p.forWho}): ${planFeesText([p])}. Includes: ${p.includes.join("; ")}.`;

export async function GET() {
  const [posts, rates] = await Promise.all([getPosts(), getRateCard()]);
  const blog = posts.length
    ? `\n## Blog\n\n${posts.map((p) => `- [${p.title}](${SITE.url}/blog/${p.slug}): ${p.excerpt}`).join("\n")}\n`
    : "";
  const body = `# ${SITE.name}

> ${SITE.description}

Unifesto is built in Hyderabad, India by ${SITE.legalName}. It started at ${PROOF.firstCampus}. As of ${PROOF.asOf}: ${PROOF.attendees} attendees checked in, ${PROOF.events} events, ${PROOF.spacesLive} live Spaces. Prices are in Indian rupees (INR); payments run through Razorpay.

## Key pages

- [Home](${SITE.url}/): overview for attendees and organisers
- [For organisers](${SITE.url}/organisers): the full platform for clubs, communities and institutions
- [The Unifesto app](${SITE.url}/app): the free attendee app for iOS and Android
- [Unifesto Sprint](${SITE.url}/sprint): hackathons with teams, judging, help desk and leaderboards
- [Unifesto Stay](${SITE.url}/stay): accommodation booking for event attendees
- [Unifesto Orbit](${SITE.url}/orbit): the campus programme; one Orbit Lead per campus helps every club run its events on Unifesto
- [Pricing](${SITE.url}/pricing): plans and platform fees, no monthly fee; buyers pay a ${buyerFeeText(rates.buyerFee, rates.buyerFeeCap)} on paid tickets
- [Events](${SITE.url}/events): public events on Unifesto
- [Spaces](${SITE.url}/spaces): clubs, communities and institutions hosting on Unifesto
- [Request a Space](${SITE.url}/request-space): how organisers get started
- [Support](${SITE.url}/support): help and contact

## What organisers get

${PILLARS.map((p) => `### ${p.title}\n${p.lede}\n${p.points.map((x) => `- ${x}`).join("\n")}`).join("\n\n")}

## Unifesto Sprint (hackathons)

${HACKATHON_STAGES.map((s) => `- ${s.title}: ${s.body}`).join("\n")}

## Unifesto Stay (event accommodation)

${STAY_STEPS.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`).join("\n")}

${FAQ_STAY.map((f) => `- ${f.q} ${f.a}`).join("\n")}

## Unifesto Orbit (campus programme)

One Orbit Lead per campus represents Unifesto (not the college) and helps every club on campus run its events on Unifesto. Rewards are recognition, not cash. Terms: ${SITE.url}/orbit/terms

${ORBIT_STEPS.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`).join("\n")}

${ORBIT_TIERS.map((t) => `- ${t.name} (${t.bar}): ${t.rewards.join("; ")}`).join("\n")}

${FAQ_ORBIT.map((f) => `- ${f.q} ${f.a}`).join("\n")}

## The attendee app

Free on the App Store (${SITE.appStore}) and Google Play (${SITE.playStore}).

${APP_FEATURES.map((f) => `- ${f.title}: ${f.body}`).join("\n")}

## Pricing (no monthly fee; each plan is priced by its platform fee per paid ticket)

${rates.plans.map(plan).join("\n")}

${pricingFaq(rates.plans, rates.buyerFee, rates.buyerFeeCap).map((f) => `- ${f.q} ${f.a}`).join("\n")}

## Common questions

${FAQ_HOME.map((f) => `### ${f.q}\n${f.a}`).join("\n\n")}

${blog}
## Contact

${SITE.email}
`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
