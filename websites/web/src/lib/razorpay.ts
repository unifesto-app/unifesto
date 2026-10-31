/* Razorpay checkout, shared by registration and My tickets. Pages load CHECKOUT_JS with their CSP nonce. */

import { call } from "@/lib/api/registration";

export const CHECKOUT_JS = "https://checkout.razorpay.com/v1/checkout.js";
/** Q40: Razorpay Custom Checkout, loaded only when a UPI payment starts. */
const RAZORPAY_JS = "https://checkout.razorpay.com/v1/razorpay.js";

export interface RazorpayPayment {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface CustomCheckout {
  createPayment(data: Record<string, unknown>, options?: Record<string, unknown>): void;
  on(event: "payment.upi.qr", handler: (d: { qr_url?: string; status?: "created" | "expired" }) => void): void;
  on(event: "payment.success", handler: (p: RazorpayPayment) => void): void;
  on(event: "payment.error", handler: (e: { error?: { description?: string } }) => void): void;
  emit(event: string): void;
}
type CustomCtor = new (options: Record<string, unknown>) => CustomCheckout;

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void };
  }
}

export interface CheckoutOptions {
  key: string;
  orderId: string;
  /** Paise. */
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  color: string;
}

// Q40: the sheet lists UPI first, then the rest as usual.
const UPI_FIRST = {
  display: {
    blocks: { upi: { name: "Pay by UPI", instruments: [{ method: "upi" }] } },
    sequence: ["block.upi"],
    preferences: { show_default_blocks: true },
  },
};

const NOT_COMPLETED = "Payment not completed. Nothing was charged. Try again when you're ready.";

/** Opens the sheet. Resolves with the signed payment; rejects when it's closed unpaid. `upi` opens it on UPI. */
export const checkout = (o: CheckoutOptions & { upi?: boolean }) =>
  new Promise<RazorpayPayment>((resolve, reject) => {
    const Standard = standard ?? window.Razorpay;
    if (!Standard) return reject(new Error("Payment didn't load. Check your connection and try again."));
    new Standard({
      key: o.key,
      order_id: o.orderId,
      amount: o.amount,
      currency: o.currency,
      name: o.name,
      description: o.description,
      prefill: o.upi ? { ...o.prefill, method: "upi" } : o.prefill,
      theme: { color: o.color },
      config: UPI_FIRST,
      handler: resolve,
      // A failed attempt stays inside the sheet so the buyer can try another
      // method; only closing it ends this attempt.
      modal: { ondismiss: () => reject(new Error(NOT_COMPLETED)) },
    }).open();
  });

/** How this browser pays by UPI without the sheet: the phone's UPI app, or a QR to scan. */
export type UpiWay = "intent" | "qr";

/**
 * Q40: Android phones open a UPI app, desktops show a QR, everything else (iPhone
 * web) keeps the sheet. null also when the web switch is off or unreadable.
 */
export async function upiWay(): Promise<UpiWay | null> {
  const ua = navigator.userAgent;
  const way: UpiWay | null = /Android/i.test(ua) ? "intent" : /iPhone|iPod|Mobi/i.test(ua) ? null : "qr";
  if (!way) return null;
  const on = await call<{ web?: boolean }>("GET", "/config/checkout").then((c) => c.web === true, () => false);
  return on ? way : null;
}

const LAST_WAY_KEY = "pay:last-method";
/** What the buyer picked last time on this browser: UPI or the sheet. */
export const lastPayMethod = (): "upi" | "more" | null => {
  try {
    const v = localStorage.getItem(LAST_WAY_KEY);
    return v === "upi" || v === "more" ? v : null;
  } catch {
    return null;
  }
};
export const rememberPayMethod = (m: "upi" | "more") => {
  try {
    localStorage.setItem(LAST_WAY_KEY, m);
  } catch {}
};

// razorpay.js claims window.Razorpay too; checkout.js keeps it, and each is held here.
let standard: Window["Razorpay"];
let custom: Promise<CustomCtor> | null = null;

function loadCustom() {
  custom ??= new Promise<CustomCtor>((resolve, reject) => {
    standard = window.Razorpay;
    // The sheet must be there first: it's the fallback, and loading after it is what keeps the global its own.
    if (!standard) return reject(new Error("checkout.js not loaded"));
    const s = document.createElement("script");
    s.src = RAZORPAY_JS;
    s.onload = () => {
      const Custom = window.Razorpay as unknown as CustomCtor;
      window.Razorpay = standard;
      resolve(Custom);
    };
    s.onerror = () => reject(new Error("razorpay.js didn't load"));
    document.head.appendChild(s);
  }).catch((e) => {
    custom = null;
    throw e;
  });
  return custom;
}

/**
 * Q40: pays by UPI without the sheet. `onWait` gets what to show while it
 * waits (the QR on a desktop, null once it's over). Until the buyer has seen
 * the QR or left for a UPI app, any error opens the sheet instead, so a
 * missing feature or detail never strands anyone. Abort `signal` to cancel.
 */
export async function payByUpi(
  o: CheckoutOptions,
  way: UpiWay,
  token: string,
  onWait: (w: { qr: string | null } | null) => void,
  signal: AbortSignal,
): Promise<RazorpayPayment> {
  const Custom = await loadCustom().catch(() => null);
  // Razorpay needs a phone number outside the sheet; the session has none.
  const contact = o.prefill.contact || (await call<{ mobileNumber?: string }>("GET", "/users/me", undefined, token).then((m) => m.mobileNumber || "", () => ""));
  if (!Custom || !contact) return checkout({ ...o, upi: true });

  return new Promise((resolve, reject) => {
    const rzp = new Custom({ key: o.key });
    let reached = false;
    let settled = false;
    const away = () => {
      if (document.visibilityState === "hidden") reached = true;
    };
    // First outcome wins; razorpay.js may still report after a cancel.
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("visibilitychange", away);
      onWait(null);
      outcome();
    };
    document.addEventListener("visibilitychange", away);
    signal.addEventListener(
      "abort",
      () =>
        finish(() => {
          rzp.emit("payment.cancel");
          reject(new Error("Payment not completed. Try again when you're ready."));
        }),
      { once: true },
    );
    rzp.on("payment.upi.qr", (d) => {
      if (settled) return;
      if (d?.status === "created" && d.qr_url) {
        reached = true;
        onWait({ qr: d.qr_url });
      } else if (d?.status === "expired") finish(() => reject(new Error("The QR code expired. Try again.")));
    });
    rzp.on("payment.success", (p) => finish(() => resolve(p)));
    rzp.on("payment.error", (e) =>
      finish(() =>
        reached
          ? reject(new Error(e?.error?.description || "UPI payment didn't go through. Try again, or pay by card, netbanking and more."))
          : resolve(checkout({ ...o, upi: true })),
      ),
    );
    onWait({ qr: null });
    rzp.createPayment(
      { amount: o.amount, currency: o.currency, email: o.prefill.email, contact, order_id: o.orderId, method: "upi" },
      way === "qr" ? { app: "any", flow: "qr" } : { app: "any" },
    );
  });
}
