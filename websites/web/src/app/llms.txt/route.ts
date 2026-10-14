import {
  APP_FEATURES,
  FAQ_HOME,
  FAQ_PRICING,
  FAQ_STAY, FAQ_HUDDLE, HUDDLE_STEPS,
  STAY_STEPS,
  HACKATHON_STAGES,
  LAUNCH_OFFER_ENDS,
  PILLARS,
  PLANS,
  PROOF,
  SITE,
  inr,
} from "@/lib/site";
import { getPosts } from "@/lib/api/blog";

/* /llms.txt: a plain-language brief of Unifesto for AI assistants and
   answer engines (llmstxt.org format). Built from the same content source
   as the pages, so it can never drift from what the site says. Blog
   posts come from the API, so this regenerates hourly. */
export const revalidate = 3600;

const plan = (p: (typeof PLANS)[number]) =>
  `- ${p.name} (${p.forWho}): ${p.price === null ? "custom quote" : `${inr(p.price)}/month, standard ${inr(p.standardPrice!)}`}; ${p.fee}% per paid ticket (standard ${p.standardFee}%). Includes: ${p.includes.join("; ")}.`;

export async function GET() {
  const posts = await getPosts();
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
- [Unifesto Huddle](${SITE.url}/huddle): online sessions for Spaces, hosted in-app
- [Pricing](${SITE.url}/pricing): plans, platform fees and launch pricing
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

## Unifesto Huddle (online sessions)

${HUDDLE_STEPS.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`).join("\n")}

${FAQ_HUDDLE.map((f) => `- ${f.q} ${f.a}`).join("\n")}

## The attendee app

Free on the App Store (${SITE.appStore}) and Google Play (${SITE.playStore}).

${APP_FEATURES.map((f) => `- ${f.title}: ${f.body}`).join("\n")}

## Pricing (launch pricing for Spaces joining before ${LAUNCH_OFFER_ENDS})

${PLANS.map(plan).join("\n")}

${FAQ_PRICING.map((f) => `- ${f.q} ${f.a}`).join("\n")}

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
