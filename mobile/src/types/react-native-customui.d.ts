// Razorpay Custom UI (Q40): only what lib/pay.ts uses. The package ships no types.
declare module 'react-native-customui' {
  /** Android: name, package and icon. iOS: only appName, Razorpay's id (google_pay, phonepe…). */
  export interface UpiAppInfo {
    appName: string;
    packageName?: string;
    iconBase64?: string;
    appLogo?: string;
  }

  const Razorpay: {
    open(options: Record<string, unknown>): Promise<{
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }>;
  };

  export default Razorpay;
}
