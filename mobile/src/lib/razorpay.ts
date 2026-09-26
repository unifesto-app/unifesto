/**
 * Razorpay Integration Helper
 * WebView-based implementation (Expo-compatible)
 */

export interface RazorpayOptions {
  orderId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  image?: string;
  prefill: {
    name: string;
    email: string;
    contact: string;
  };
  keyId: string;
}

export interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

/**
 * Open Razorpay checkout using WebView
 * Note: This function is now handled by RazorpayWebView component
 * Use the component directly in your screens instead
 */
export async function openRazorpayCheckout(
  options: RazorpayOptions
): Promise<RazorpayResponse> {
  throw new Error(
    'Please use RazorpayWebView component instead of this function. ' +
    'Import RazorpayWebView from @/components/RazorpayWebView and use it as a modal.'
  );
}
