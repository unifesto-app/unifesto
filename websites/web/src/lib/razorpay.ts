/* Razorpay Standard Checkout, shared by registration and My tickets. Pages load CHECKOUT_JS with their CSP nonce. */

export const CHECKOUT_JS = "https://checkout.razorpay.com/v1/checkout.js";

export interface RazorpayPayment {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void };
  }
}

/** Opens the sheet. Resolves with the signed payment; rejects when it's closed unpaid. */
export const checkout = (o: {
  key: string;
  orderId: string;
  /** Paise. */
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  color: string;
}) =>
  new Promise<RazorpayPayment>((resolve, reject) => {
    if (!window.Razorpay) return reject(new Error("Payment didn't load. Check your connection and try again."));
    new window.Razorpay({
      key: o.key,
      order_id: o.orderId,
      amount: o.amount,
      currency: o.currency,
      name: o.name,
      description: o.description,
      prefill: o.prefill,
      theme: { color: o.color },
      handler: resolve,
      // A failed attempt stays inside the sheet so the buyer can try another
      // method; only closing it ends this attempt.
      modal: { ondismiss: () => reject(new Error("Payment not completed. Nothing was charged. Try again when you're ready.")) },
    }).open();
  });
