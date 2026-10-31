import type { Metadata } from "next";
import { Fragment } from "react";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import { Check, Minus, ArrowRight } from "@unifesto/unicon/react";
import PageHero from "@/components/site/PageHero";
import Section from "@/components/site/Section";
import FaqList from "@/components/site/FaqList";
import PassPaysYou from "@/components/site/PassPaysYou";
import ShadeCard, { SHADES } from "@/components/site/ShadeCard";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { LAUNCH_OFFER_ENDS, SITE, type Catalog, type CatalogRow, type Plan, buyerFeeText, inr, passExample, planFee, planFeesText, pricingFaq } from "@/lib/site";
import { getRateCard } from "@/lib/api/rate-card";

/* Fees come from the live rate card, refreshed every 5 minutes. */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { plans, buyerFee, buyerFeeCap, feeFrom } = await getRateCard();
  return withSocial({
    title: "Pricing: free RSVP events, clear fees on paid tickets",
    description: `Free RSVP events on every plan. Buyers pay a ${buyerFeeText(buyerFee, buyerFeeCap)}, or you include it in your price. Organiser platform fee per paid ticket${feeFrom ? ` from ${feeFrom}` : ""}: ${planFeesText(plans)}. ${passExample(plans[0], buyerFee, buyerFeeCap, feeFrom)}`,
    alternates: { canonical: "/pricing" },
  }, { title: "Unifesto pricing", description: "Free RSVP events. See what students pay and what you keep." });
}

const productLd = (plans: Plan[]) => ({
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Unifesto event platform",
  brand: { "@type": "Brand", name: SITE.name },
  description: SITE.description,
  offers: plans.filter((p) => p.price !== null).map((p) => ({
    "@type": "Offer",
    name: `${p.name} plan`,
    price: p.price,
    priceCurrency: "INR",
    url: `${SITE.url}/pricing`,
    availability: "https://schema.org/InStock",
  })),
});

export default async function PricingPage() {
  const { plans, buyerFee, buyerFeeCap, feeFrom, catalog } = await getRateCard();
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd data={[productLd(plans), breadcrumbLd([{ name: "Home", path: "/" }, { name: "Pricing", path: "/pricing" }])]} />
      <Navbar />

      <PageHero
        lines={["Free events stay free.", "Paid ones cost less."]}
        accentFrom={1}
        lede={`Launch pricing: Spaces that join before ${LAUNCH_OFFER_ENDS} keep these prices. Every plan includes the Unifesto app for attendees and Crew.`}
        size="md"
      />

      <Section pad="tight" id="plans">
        {/* Each card spans 7 rows of one shared grid (subgrid, through every
            layer of the card), so name, price, fee and button line up across
            cards however their text wraps. Plans sit as glass on their shade;
            the featured one stays solid blue. */}
        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" data-stagger="rise">
          {plans.map((plan, i) => {
            const featured = plan.id === "growth";
            const off = plan.standardPrice && plan.price !== null ? Math.round((1 - plan.price / plan.standardPrice) * 100) : 0;
            const rows = "row-span-7 grid grid-cols-[minmax(0,1fr)] grid-rows-subgrid";
            const card = (
              <article className={`${rows} gap-y-0 rounded-xl p-6 ${featured ? "" : "bg-night-2"}`}>
                <h2 className="font-display text-lg text-paper">{plan.name}</h2>
                <p className="mt-1.5 text-sm text-paper/70">{plan.forWho}</p>

                <div className="mt-5 flex flex-wrap items-baseline gap-x-2">
                  {plan.price === null ? (
                    <span className="font-display text-3xl text-paper">Custom</span>
                  ) : (
                    <>
                      <span className="tabular font-display text-3xl text-paper">{inr(plan.price)}</span>
                      <span className="text-sm text-paper/60">/ month</span>
                    </>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-paper/55">
                  {off > 0 && (
                    <>
                      <s className="tabular">{inr(plan.standardPrice!)}</s> {off}% off at launch ·{" "}
                    </>
                  )}
                  {plan.annualMonthly ? `${inr(plan.annualMonthly)}/mo billed yearly` : plan.price === 0 ? "No card needed" : "Quoted per institution"}
                </p>

                <p className="mt-5 border-y border-border py-2.5 text-sm text-paper">
                  <span className="tabular font-display">{planFee(plan)}</span>{" "}
                  <s className="tabular text-xs text-paper/45">{plan.standardFee}%</s>
                  <span className="block text-xs text-paper/70">per paid ticket{feeFrom ? ` from ${feeFrom}` : ""}</span>
                </p>

                <Link href={plan.cta.href} className={`btn mt-6 w-full self-start ${featured ? "btn-ink" : "btn-secondary"}`}>
                  {plan.cta.label}
                  <ArrowRight className="btn-arrow h-3.5 w-3.5" weight="bold" aria-hidden="true" />
                </Link>

                <ul className="mt-7 flex flex-col gap-2.5">
                  {plan.includes.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-paper/85">
                      <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-paper/60" weight="bold" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            );
            return featured ? (
              <div key={plan.id} className={`${rows} mb-5 rounded-2xl bg-primary p-3`}>
                {card}
              </div>
            ) : (
              <ShadeCard key={plan.id} shade={SHADES[i % SHADES.length]} glass className={`${rows} mb-5 p-3`} glassClassName={rows}>
                {card}
              </ShadeCard>
            );
          })}
        </div>
        <p className="mt-8 text-center text-sm text-paper/55">
          {/* TODO(A6): GST wording waits for GST registration and the CA. */}
          Prices exclude GST. Buyers pay a {buyerFeeText(buyerFee, buyerFeeCap)} on paid tickets, on every plan, or you include it in your ticket price. Razorpay&apos;s charges come out of that fee. Free RSVP events carry no fees on any plan.
        </p>
      </Section>

      {catalog.length > 0 && <CompareSection plans={plans} catalog={catalog} />}

      <Section surface="paper" aria-labelledby="compare-heading">
        <PassPaysYou
          plans={plans.map((p) => ({ id: p.id, name: p.name, fee: p.fee, feeText: planFee(p) }))}
          buyerFee={buyerFee}
          buyerFeeCap={buyerFeeCap}
          feeFrom={feeFrom}
        />
      </Section>

      <FaqList faqs={pricingFaq(plans, buyerFee, buyerFeeCap, feeFrom)} />

      <Section width="text" innerClassName="text-center">
        <h2 data-reveal="clip" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.15] text-paper [text-wrap:balance]">
          Not sure which plan fits?
        </h2>
        <p data-reveal="blur" className="mx-auto mt-4 max-w-[46ch] text-[15px] font-light leading-relaxed text-paper/65">
          Start on General. Move up from Billing in your Space whenever you need certificates, sponsors or hackathon judging.
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

const limitText = (n: number | null | undefined) => (n === null || n === undefined ? "Unlimited" : n.toLocaleString("en-IN"));

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
                  <th colSpan={plans.length + 1} className="border-t border-paper/10 bg-paper/[0.04] px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-paper/60">
                    {g.group}
                  </th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="sticky left-0 z-10 border-t border-paper/10 bg-canvas px-4 py-2.5 text-left font-normal text-paper/85">
                      {r.label}
                    </th>
                    {plans.map((p) => (
                      <td key={p.id} className="tabular border-t border-paper/10 px-3 py-2.5 text-paper/85">
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
