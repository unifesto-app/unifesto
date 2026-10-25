import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import { Check, ArrowRight } from "@unifesto/unicon/react";
import PageHero from "@/components/site/PageHero";
import Section from "@/components/site/Section";
import FaqList from "@/components/site/FaqList";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { EXAMPLE_PASS, LAUNCH_OFFER_ENDS, SITE, type Plan, buyerFeeOn, buyerFeeText, inr, passExample, planFeesText, pricingFaq, rupees } from "@/lib/site";
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
  const { plans, buyerFee, buyerFeeCap, feeFrom } = await getRateCard();
  const studentPays = rupees(EXAMPLE_PASS + buyerFeeOn(EXAMPLE_PASS, buyerFee, buyerFeeCap));
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
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3" data-stagger="rise">
          {plans.map((plan) => {
            const featured = plan.id === "pro";
            const off = plan.standardPrice && plan.price !== null ? Math.round((1 - plan.price / plan.standardPrice) * 100) : 0;
            return (
              <article key={plan.id} className={`relative flex flex-col rounded-xl p-7 ${featured ? "bg-primary" : "bg-night-2 shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.08)]"}`}>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg text-paper">{plan.name}</h2>
                  {off > 0 && <span className="rounded-full bg-ink px-3 py-1 text-[11px] text-[var(--paper-bg)]">{off}% off at launch</span>}
                </div>
                <p className="mt-2 text-sm text-paper/70">{plan.forWho}</p>

                <div className="mt-6 flex items-end gap-2">
                  {plan.price === null ? (
                    <span className="font-display text-4xl text-paper">Custom</span>
                  ) : (
                    <>
                      <span className="tabular font-display text-4xl text-paper">{inr(plan.price)}</span>
                      <span className="mb-1 text-sm text-paper/60">/ month</span>
                      {off > 0 && <s className="tabular mb-1 text-sm text-paper/45">{inr(plan.standardPrice!)}</s>}
                    </>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-paper/55">
                  {plan.annualMonthly ? `${inr(plan.annualMonthly)} / month billed yearly` : plan.price === 0 ? "No card needed" : "Quoted per institution"}
                </p>

                <p className="mt-5 flex items-baseline gap-2 rounded-md bg-paper/[0.06] px-3 py-2.5 text-sm text-paper">
                  <span className="tabular font-display">{plan.fee}%</span>
                  <s className="tabular text-xs text-paper/45">{plan.standardFee}%</s>
                  <span className="text-paper/70">per paid ticket{feeFrom ? ` from ${feeFrom}` : ""}</span>
                </p>

                <Link href={plan.cta.href} className={`btn mt-6 w-full ${featured ? "btn-ink" : "btn-secondary"}`}>
                  {plan.cta.label}
                  <ArrowRight className="btn-arrow h-3.5 w-3.5" weight="bold" aria-hidden="true" />
                </Link>

                <ul className="mt-7 flex flex-1 flex-col gap-2.5">
                  {plan.includes.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-paper/85">
                      <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-paper/60" weight="bold" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
        <p className="mt-8 text-center text-sm text-paper/55">
          {/* TODO(A6): GST wording waits for GST registration and the CA. */}
          Prices exclude GST. Buyers pay a {buyerFeeText(buyerFee, buyerFeeCap)} on paid tickets, on every plan, or you include it in your ticket price. Razorpay&apos;s charges come out of that fee. Free RSVP events carry no fees on any plan.
        </p>
      </Section>

      <Section surface="paper" aria-labelledby="compare-heading">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
          <div>
            <h2 id="compare-heading" data-reveal="clip" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.15] text-ink [text-wrap:balance]">
              What a {inr(EXAMPLE_PASS)} pass pays you.
            </h2>
            <p data-reveal="blur" className="mt-4 max-w-[46ch] text-[15px] font-light leading-relaxed text-ink/70">
              Students pay {studentPays}, or {inr(EXAMPLE_PASS)} if you include the fee in your price. Razorpay&apos;s charges come out of the buyer fee, so this is what reaches you{feeFrom ? ` from ${feeFrom}` : ""}. Free events cost nothing.
            </p>
          </div>
          <table className="w-full text-sm">
            <caption className="sr-only">What you keep from a {inr(EXAMPLE_PASS)} pass, by plan</caption>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="w-44 py-2.5 pr-4 text-left font-normal text-ink">{p.name}, {p.fee}% fee</th>
                  <td className="py-2.5">
                    <div className="h-2 rounded-full bg-white/[0.05]">
                      <div data-reveal="fill" className="h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${1 - p.fee / 100})` }} />
                    </div>
                  </td>
                  <td className="tabular w-20 py-2.5 pl-4 text-right text-ink">{rupees(EXAMPLE_PASS * (1 - p.fee / 100))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <FaqList faqs={pricingFaq(plans, buyerFee, buyerFeeCap, feeFrom)} />

      <Section width="text" innerClassName="text-center">
        <h2 data-reveal="clip" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.15] text-paper [text-wrap:balance]">
          Not sure which plan fits?
        </h2>
        <p data-reveal="blur" className="mx-auto mt-4 max-w-[46ch] text-[15px] font-light leading-relaxed text-paper/65">
          Start on Starter. Move up from Billing in your Space whenever you need certificates, sponsors or hackathon judging.
        </p>
        <div data-reveal="rise" className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
