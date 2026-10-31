"use client";

import { useState } from "react";
import { EXAMPLE_PASS, buyerFeeOn, includedFeeOn, inr, rupees } from "@/lib/site";

/**
 * "What a ₹500 pass pays you", with the per-event choice (A33) as a toggle:
 * the buyer fee on top of the price (default) or included in it. Each plan's
 * row shows what reaches the organiser after its platform fee.
 */
export default function PassPaysYou({
  plans,
  buyerFee,
  buyerFeeCap,
}: {
  /** `fee` drives the maths; `feeText` is how it reads ("4.5%"). */
  plans: { id: string; name: string; fee: number; feeText: string }[];
  buyerFee: number;
  buyerFeeCap: number | null;
}) {
  const [included, setIncluded] = useState(false);
  const onTop = buyerFeeOn(EXAMPLE_PASS, buyerFee, buyerFeeCap);
  const inside = includedFeeOn(EXAMPLE_PASS, buyerFee, buyerFeeCap);
  const base = included ? EXAMPLE_PASS - inside : EXAMPLE_PASS;
  const cap = buyerFeeCap ? `, max ₹${buyerFeeCap} a ticket` : "";

  return (
    <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
      <div>
        <h2 id="compare-heading" data-reveal="clip" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.15] text-ink [text-wrap:balance]">
          What a {inr(EXAMPLE_PASS)} pass pays you.
        </h2>
        <p data-reveal="blur" className="mt-4 max-w-[46ch] text-[15px] font-light leading-relaxed text-ink/70">
          Razorpay&apos;s charges come out of the buyer fee, so this is what reaches you. Free events cost nothing.
        </p>

        <button
          type="button"
          role="switch"
          aria-checked={included}
          onClick={() => setIncluded((v) => !v)}
          className="mt-8 flex w-full max-w-[46ch] items-center justify-between gap-4 rounded-lg px-4 py-3 text-left shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.12)]"
        >
          <span className="text-sm text-ink">Include the processing fee in your ticket prices</span>
          <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${included ? "bg-primary" : "bg-ink/20"}`}>
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${included ? "translate-x-5 bg-canvas" : "bg-ink"}`}
            />
          </span>
        </button>
        <p className="mt-3 max-w-[46ch] text-sm leading-relaxed text-ink/70" aria-live="polite">
          {included
            ? `On a ${inr(EXAMPLE_PASS)} ticket the buyer pays ${inr(EXAMPLE_PASS)} and the ${rupees(inside)} fee comes out of it, so you get ${rupees(base)}.`
            : `On a ${inr(EXAMPLE_PASS)} ticket the buyer pays ${rupees(EXAMPLE_PASS + onTop)} (${buyerFee}% fee on top${cap}) and you get ${rupees(EXAMPLE_PASS)}.`}{" "}
          Set it per event on its Tickets page. Changes apply to new sales only.
        </p>
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">
          What you keep from a {inr(EXAMPLE_PASS)} pass, by plan, with the fee {included ? "included" : "on top"}
        </caption>
        <thead>
          <tr className="text-xs text-ink/55">
            <th scope="col" className="pb-2 text-left font-normal">
              Buyer pays {rupees(included ? EXAMPLE_PASS : EXAMPLE_PASS + onTop)}
            </th>
            <th scope="col" className="pb-2">
              <span className="sr-only">Share kept</span>
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              You keep
            </th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => {
            const keep = base * (1 - p.fee / 100);
            return (
              <tr key={p.id}>
                <th scope="row" className="w-44 py-2.5 pr-4 text-left font-normal text-ink">
                  {p.name}, {p.feeText} fee
                </th>
                <td className="py-2.5">
                  <div className="h-2 rounded-full bg-white/[0.05]">
                    <div
                      data-reveal="fill"
                      className="h-full origin-left rounded-full bg-primary transition-transform"
                      style={{ transform: `scaleX(${keep / EXAMPLE_PASS})` }}
                    />
                  </div>
                </td>
                <td className="tabular w-20 py-2.5 pl-4 text-right text-ink">{rupees(keep)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
