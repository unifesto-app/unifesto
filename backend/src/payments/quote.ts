/**
 * The fee half of the terms a sale is priced under (T5). TermsService.resolve
 * builds the full terms; quote() only needs the buyer fee.
 */
export interface FeeTerms {
  /** Buyer fee in basis points (500 = 5%). */
  buyerFeeBps: number;
  /** Most the buyer fee can be per ticket, in paise (D11: 9900). */
  buyerFeeCapPaise: number;
  /** Organiser platform fee in basis points, when known (shown, never charged here). */
  organiserFeeBps?: number;
}

export interface QuoteOptions {
  /** Priced units for the per-ticket cap; 0 or missing counts as 1. */
  tickets?: number;
  /** The organiser absorbs the buyer fee (A33): it comes out of the listed price. */
  absorb?: boolean;
  /** A coupon's discount off the base, already validated by CouponsService. */
  couponDiscountPaise?: number;
}

export interface Quote {
  /** What the ticket earns the organiser before their platform fee. */
  basePaise: number;
  couponDiscountPaise: number;
  buyerFeePaise: number;
  /** What the buyer pays. */
  totalPaise: number;
  /** Platform fee on the base, when the terms carry one. */
  organiserFeePaise: number | null;
}

/** a × b / c rounded half up, in integers. */
const mulDivRound = (a: number, b: number, c: number) =>
  Math.floor((a * b * 2 + c) / (c * 2));

/**
 * Price one sale in integer paise. `listedPaise` is the ticket price × units
 * before any coupon. Fee on top (default): total = base + min(bps of base,
 * cap per ticket). Absorbed: the buyer pays the listed price and the fee is
 * carved out of it at the same rate and cap, so base = listed − fee.
 */
export function quote(
  listedPaise: number,
  terms: FeeTerms,
  opts: QuoteOptions = {},
): Quote {
  const discount = Math.min(
    Math.max(0, Math.round(opts.couponDiscountPaise ?? 0)),
    listedPaise,
  );
  const listed = listedPaise - discount;
  const cap =
    terms.buyerFeeCapPaise * Math.max(1, Math.trunc(opts.tickets ?? 1));
  const fee = opts.absorb
    ? Math.min(
        mulDivRound(listed, terms.buyerFeeBps, 10_000 + terms.buyerFeeBps),
        cap,
      )
    : Math.min(mulDivRound(listed, terms.buyerFeeBps, 10_000), cap);
  const base = opts.absorb ? listed - fee : listed;
  return {
    basePaise: base,
    couponDiscountPaise: discount,
    buyerFeePaise: fee,
    totalPaise: opts.absorb ? listed : listed + fee,
    organiserFeePaise:
      terms.organiserFeeBps == null
        ? null
        : mulDivRound(base, terms.organiserFeeBps, 10_000),
  };
}

/** Rupees (2dp) to integer paise. */
export const toPaise = (rupees: number) => Math.round(rupees * 100);

/** The rate-card buyer fee (D11): PlatformConfig's 4%, capped ₹99 per ticket. */
export function rateCardFees(cfg: {
  getProcessingFeePercent(): number;
  getProcessingFeeCapPerTicket(): number;
}): FeeTerms {
  return {
    buyerFeeBps: Math.round(cfg.getProcessingFeePercent() * 100),
    buyerFeeCapPaise: toPaise(cfg.getProcessingFeeCapPerTicket()),
  };
}
