/**
 * Q40: the netbanking banks and wallets our Razorpay account takes, for the
 * app's and site's own payment page. Razorpay's /v1/methods sends no CORS
 * header, so the site can't read it; this reads it with our public key and
 * caches it. A failed read serves the last good list (or none, and the page
 * then offers UPI and cards only).
 */
export interface PayOption {
  code: string;
  name: string;
}
export interface PaymentMethods {
  netbanking: PayOption[];
  wallets: PayOption[];
}

const TTL_MS = 10 * 60_000;
const RETRY_MS = 60_000;
const EMPTY: PaymentMethods = { netbanking: [], wallets: [] };
// Razorpay sends wallets as codes only.
const WALLET_NAMES: Record<string, string> = {
  airtelmoney: 'Airtel Money',
  amazonpay: 'Amazon Pay',
  freecharge: 'Freecharge',
  jiomoney: 'JioMoney',
  mobikwik: 'MobiKwik',
  olamoney: 'Ola Money',
  payzapp: 'PayZapp',
  phonepe: 'PhonePe',
};

let cached: { at: number; value: PaymentMethods } | null = null;

export function toPaymentMethods(raw: {
  netbanking?: Record<string, string>;
  wallet?: Record<string, boolean>;
}): PaymentMethods {
  return {
    netbanking: Object.entries(raw.netbanking ?? {})
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    wallets: Object.entries(raw.wallet ?? {})
      .filter(([, on]) => on === true)
      .map(([code]) => ({ code, name: WALLET_NAMES[code] ?? code })),
  };
}

export async function paymentMethods(now = Date.now()): Promise<PaymentMethods> {
  if (cached && now - cached.at < TTL_MS) return cached.value;
  try {
    const res = await fetch(
      `https://api.razorpay.com/v1/methods?key_id=${process.env.RAZORPAY_KEY_ID}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error(`Razorpay methods ${res.status}`);
    cached = { at: now, value: toPaymentMethods(await res.json()) };
  } catch {
    // Serve what we had (or nothing) and ask Razorpay again in a minute.
    cached = { at: now - TTL_MS + RETRY_MS, value: cached?.value ?? EMPTY };
  }
  return cached.value;
}
