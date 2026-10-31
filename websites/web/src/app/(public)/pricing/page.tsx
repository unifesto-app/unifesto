import type { Metadata } from "next";
import { Fragment } from "react";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import { Check, Minus, ArrowRight } from "@unifesto/unicon/react";
import PageHero from "@/components/site/PageHero";
import Section from "@/components/site/Section";
import FaqList from "@/components/site/FaqList";
import PassPaysYou from "@/components/site/PassPaysYou";
import ShadeCard, { SHADES, type Shade } from "@/components/site/ShadeCard";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { SITE, type Catalog, type CatalogRow, type Plan, buyerFeeText, passExample, planFee, planFeesText, planMinimum, pricingFaq } from "@/lib/site";
import { getRateCard } from "@/lib/api/rate-card";

/* Fees come from the live rate card, refreshed every 5 minutes. */
export const revalidate = 300;
export const dynamic = "force-static"; // prerendered, CDN-cacheable: lib/cached-pages.ts

export async function generateMetadata(): Promise<Metadata> {
  const { plans, buyerFee, buyerFeeCap } = await getRateCard();
  return withSocial({
    title: "Pricing: free RSVP events, clear fees on paid tickets",
    description: `No monthly fee. Free RSVP events on every plan. Buyers pay a ${buyerFeeText(buyerFee, buyerFeeCap)}, or you include it in your price. Organiser platform fee per paid ticket: ${planFeesText(plans)}. ${passExample(plans[0], buyerFee, buyerFeeCap)}`,
    alternates: { canonical: "/pricing" },
  }, { title: "Unifesto pricing", description: "Free RSVP events. See what students pay and what you keep." });
}

/* Each paid plan's shade; the free plan lies across in mint, Growth is solid. */
const PLAN_SHADES: Record<string, Shade> = { club: "sky", pro: "blue", enterprise: "ivory" };

const productLd = (plans: Plan[]) => ({
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Unifesto event platform",
  brand: { "@type": "Brand", name: SITE.name },
  description: SITE.description,
  // No plan has a monthly price (Z2): General is the one free-to-start offer.
  offers: plans.filter((p) => p.id === "starter").map((p) => ({
    "@type": "Offer",
    name: `${p.name} plan`,
    price: 0,
    priceCurrency: "INR",
    url: `${SITE.url}/pricing`,
    availability: "https://schema.org/InStock",
  })),
});

export default async function PricingPage() {
  const { plans, buyerFee, buyerFeeCap, catalog } = await getRateCard();
  const free = plans.find((p) => p.id === "starter");
  const paid = plans.filter((p) => p !== free);
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd data={[productLd(plans), breadcrumbLd([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }])]} />
      <Navbar />

      <PageHero
        lines={["Free events stay free.", "Paid ones cost less."]}
        accentFrom={1}
        lede="No monthly fee on any plan. You pay a platform fee only on tickets you sell. Every plan includes the Unifesto app for attendees and Crew."
        size="md"
      />

      <Section pad="tight" id="plans">
        {/* Each paid card spans 6 rows of one shared grid (subgrid, through
            every layer of the card), so name, fee and button line up
            across cards however their text wraps. Plans sit as glass on their
            shade; the featured one stays solid. The free plan lies across the
            width below them: where every Space starts, not one of the tiers. */}
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2 xl:grid-cols-4" data-stagger="rise">
          {paid.map((plan, i) => {
            const featured = plan.id === "growth";
            const rows = "row-span-6 grid grid-cols-[minmax(0,1fr)] grid-rows-subgrid";
            const card = (
              <article className={`${rows} gap-y-0 rounded-xl p-6 ${featured ? "" : "bg-night-2"}`}>
                <h2 className="font-display text-lg text-paper">{plan.name}</h2>
                <p className="mt-1.5 text-sm text-paper/70">{plan.forWho}</p>
                <PlanPrice plan={plan} />
                <PlanCta plan={plan} featured={featured} />
                <PlanIncludes items={plan.includes} />
              </article>
            );
            return featured ? (
              <div key={plan.id} className={`${rows} mb-5 rounded-2xl bg-primary p-3`}>
                {card}
              </div>
            ) : (
              <ShadeCard key={plan.id} shade={PLAN_SHADES[plan.id] ?? SHADES[i % SHADES.length]} glass className={`${rows} mb-5 p-3`} glassClassName={rows}>
                {card}
              </ShadeCard>
            );
          })}
        </div>
        {free && (
          <ShadeCard shade="mint" glass className="p-3" glassClassName="w-full">
            <article className="grid gap-6 rounded-xl bg-night-2 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] lg:gap-10">
              <div>
                <h2 className="font-display text-lg text-paper">{free.name}</h2>
                <p className="mt-1.5 text-sm text-paper/70">{free.forWho}</p>
                <PlanPrice plan={free} />
              </div>
              <div>
                <PlanCta plan={free} featured={false} />
              </div>
              <PlanIncludes items={free.includes} across />
            </article>
          </ShadeCard>
        )}
        <p className="mt-8 text-center text-sm text-paper/55">
          {/* TODO(A6): GST wording waits for GST registration and the CA. */}
          Fees exclude GST. Buyers pay a {buyerFeeText(buyerFee, buyerFeeCap)} on paid tickets, on every plan, or you include it in your ticket price. Razorpay&apos;s charges come out of that fee. Free RSVP events carry no fees on any plan.
        </p>
      </Section>

      {catalog.length > 0 && <CompareSection plans={plans} catalog={catalog} />}

      <Section surface="paper" aria-labelledby="compare-heading">
        <PassPaysYou
          plans={plans.filter((p) => !p.feeText).map((p) => ({ id: p.id, name: p.name, fee: p.fee, feeText: planFee(p) }))}
          buyerFee={buyerFee}
          buyerFeeCap={buyerFeeCap}
        />
      </Section>

      <FaqList faqs={pricingFaq(plans, buyerFee, buyerFeeCap)} />

      <Section width="text" innerClassName="text-center">
        <h2 data-reveal="clip" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.15] text-paper [text-wrap:balance]">
          Not sure which plan fits?
        </h2>
        <p data-reveal="blur" className="mx-auto mt-4 max-w-[46ch] text-[15px] font-light leading-relaxed text-paper/65">
          Start on General. When you need certificates, sponsors or hackathon judging, write to us and we move your Space up.
        </p>
        <div data-reveal="rise" className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/request-space" className="btn btn-lg btn-primary">
            Request a Space
            <ArrowRight className="btn-arrow h-3.5 w-3.5" weight="bold" aria-hidden="true" />
          </Link>
          <a href={`mailto:${SITE.email}`} className="btn btn-lg btn-secondary">Talk to us</a>
        </div>
      </Section>
      <Footer />
    </main>
  );
}

/* A plan card's parts, shared by the paid columns and the free plan laid
   across. The fee is two rows (rate, then the note under it) so the paid
   cards' subgrid lines them up. */
function PlanPrice({ plan }: { plan: Plan }) {
  return (
    <>
      <div className="mt-5 flex flex-wrap items-baseline gap-x-2">
        <span className="tabular font-display text-3xl text-paper">{planFee(plan)}</span>
        {!plan.feeText && <span className="text-sm text-paper/60">per paid ticket</span>}
      </div>
      <p className="mt-1.5 text-xs text-paper/55">
        {plan.feeText ? "Quoted per institution" : (planMinimum(plan) ?? "No monthly fee")}
      </p>
    </>
  );
}

function PlanCta({ plan, featured }: { plan: Plan; featured: boolean }) {
  return (
    <Link href={plan.cta.href} className={`btn mt-6 w-full self-start ${featured ? "btn-ink" : "btn-secondary"}`}>
      {plan.cta.label}
      <ArrowRight className="btn-arrow h-3.5 w-3.5" weight="bold" aria-hidden="true" />
    </Link>
  );
}

/* A column of ruled rows, or (`across`, the free plan) two columns where
   every item carries its own top rule so both columns line up. */
function PlanIncludes({ items, across = false }: { items: Plan["includes"]; across?: boolean }) {
  return (
    <ul className={across ? "grid gap-x-6 self-start sm:grid-cols-2" : "mt-6 divide-y divide-border border-t border-border"}>
      {items.map((item) => (
        <li key={item} className={`flex items-start gap-2.5 py-2.5 text-sm text-paper/85 ${across ? "border-t border-border" : ""}`}>
          <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-paper/60" weight="bold" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

const limitText =(n: number | null | undefined) => (n === null || n === undefined ? "Unlimited" : n.toLocaleString("en-IN"));

/** One comparison cell: the plan's limit, or a tick or dash for a feature. */
function cell(r: CatalogRow, p: Plan) {
  if (r.limit) return limitText(p.row?.[r.limit]);
  const on = r.flag ? !!p.row?.[r.flag] : true;
  return on ? (
    <Check className="h-4 w-4 text-paper" weight="bold" aria-label="Included" />
  ) : (
    <Minus className="h-4 w-4 text-paper/30" aria-label="Not included" />
  );
}

/** Every feature, every plan, from the backend catalog (the same list Space billing shows). */
function CompareSection({ plans, catalog }: { plans: Plan[]; catalog: Catalog }) {
  return (
    <Section aria-labelledby="every-feature-heading">
      <h2 id="every-feature-heading" data-reveal="clip" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.15] text-paper">
        Every feature, every plan.
      </h2>
      <div className="mt-8 overflow-x-auto rounded-2xl shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.08)]">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">What each Unifesto plan includes</caption>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-72 bg-night-2 px-4 py-3 text-left font-normal">
                <span className="sr-only">Feature</span>
              </th>
              {plans.map((p) => (
                <th key={p.id} scope="col" className="bg-night-2 px-3 py-3 text-left font-display text-paper">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catalog.map((g) => (
              <Fragment key={g.group}>
                <tr>
                  <th colSpan={plans.length + 1} className="border-t border-border px-4 pb-2 pt-5 text-left text-xs font-medium uppercase tracking-wide text-paper/60">
                    {g.group}
                  </th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="sticky left-0 z-10 border-t border-border bg-canvas px-4 py-2.5 text-left font-normal text-paper/85">
                      {r.label}
                    </th>
                    {plans.map((p) => (
                      <td key={p.id} className="tabular border-t border-border px-3 py-2.5 text-paper/85">
                        {cell(r, p)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
