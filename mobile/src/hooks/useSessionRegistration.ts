/**
 * Register + pay for a session. Mirrors the event registration flow: create the
 * registration, and if it needs payment, open native Razorpay checkout and
 * verify. Free sessions resolve in one step. Razorpay-only.
 */

import { useState } from 'react';
import RazorpayCheckout from 'react-native-razorpay';
import {
  registerForSession,
  verifySessionPayment,
  type Session,
} from '../lib/api/sessions';
import { isIosDigitalPurchaseBlocked } from '../lib/iosPurchasePolicy';

interface PrefillUser {
  fullName?: string | null;
  mobileNumber?: string | null;
  email?: string | null;
}

export interface SessionRegistrationResult {
  success: boolean;
  paid: boolean;
  cancelled?: boolean;
  error?: string;
}

export const PAID_SESSION_IOS_NOTE = "Registration for paid sessions isn't available in the iOS app.";

/** True when this session needs payment and we're on iOS (see lib/iosPurchasePolicy). */
export function isPaidSessionBlocked(session: Pick<Session, 'price'>): boolean {
  return isIosDigitalPurchaseBlocked(session.price);
}

export function useSessionRegistration() {
  const [loading, setLoading] = useState(false);

  async function register(
    session: Session,
    user?: PrefillUser | null
  ): Promise<SessionRegistrationResult> {
    if (isPaidSessionBlocked(session)) {
      return { success: false, paid: false, error: PAID_SESSION_IOS_NOTE };
    }

    setLoading(true);
    try {
      const res = await registerForSession(session.id);

      // Free session — nothing more to do.
      if (!res.needsPayment || !res.razorpayOrderId) {
        return { success: true, paid: false };
      }

      // Paid session — open native checkout.
      const options = {
        key: res.razorpayKeyId!,
        order_id: res.razorpayOrderId,
        amount: res.amount!,
        currency: res.currency || 'INR',
        name: 'Unifesto',
        description: session.title,
        image: session.coverImageUrl || 'https://unifesto.app/logo.png',
        prefill: {
          name: user?.fullName || '',
          email: user?.email || '',
          contact: user?.mobileNumber || '',
        },
        theme: { color: '#111113' },
      };

      let payment;
      try {
        payment = await RazorpayCheckout.open(options);
      } catch (paymentError: any) {
        // User dismissed the sheet or payment failed. The registration stays
        // PENDING and is reused on the next attempt — not an error to surface.
        return {
          success: false,
          paid: false,
          cancelled: true,
        };
      }

      await verifySessionPayment({
        registrationId: res.registrationId,
        razorpayOrderId: payment.razorpay_order_id!,
        razorpayPaymentId: payment.razorpay_payment_id,
        razorpaySignature: payment.razorpay_signature!,
      });

      return { success: true, paid: true };
    } catch (err: any) {
      return {
        success: false,
        paid: false,
        error: err?.message || 'Registration failed',
      };
    } finally {
      setLoading(false);
    }
  }

  return { register, loading };
}
