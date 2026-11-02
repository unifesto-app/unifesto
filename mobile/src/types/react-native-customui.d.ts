// Razorpay Custom UI (Q40): only what lib/pay.ts uses. The package ships no types.
declare module 'react-native-customui' {
  /** What the iOS SDK reports per app; shortcode is Razorpay's id (google_pay, phonepe…). */
  export interface IosUpiApp {
    appName: string;
    shortcode: string;
    uriScheme?: string;
  }

  /**
   * Android: name, package and icon. iOS: the bridge wraps each SDK entry as
   * { appName: entry } (it was written for the old string-only API), so
   * appName is the whole IosUpiApp there.
   */
  export interface UpiAppInfo {
    appName: string | IosUpiApp;
    packageName?: string;
    iconBase64?: string;
    appLogo?: string;
  }

  const Razorpay: {
    /** Starts the SDK with a key, for canMakePayment. Its promise never settles. */
    initRazorpay(key: string): Promise<never>;
    /** Apple Pay on this phone (iOS; false without the Apple Pay pod). Never rejects. */
    canMakePayment(): Promise<boolean>;
    open(options: Record<string, unknown>): Promise<{
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }>;
  };

  export default Razorpay;
}
