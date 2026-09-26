/**
 * Hook for handling registration and payment flow
 */

import { useState } from 'react';
import {} from 'react-native';
import {
  createRegistration,
  verifyPayment,
  getRazorpayConfig,
  CreateRegistrationData,
} from '../lib/api/registrations';
import { openRazorpayCheckout } from '../lib/razorpay';
import { AppAlert } from '../components/ui/AppAlert';

export function useRegistrationPayment() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Process registration with payment
   */
  const processRegistration = async (
    registrationData: CreateRegistrationData,
    eventTitle: string,
    eventBanner?: string
  ) => {
    const eventId = registrationData.eventId;
    try {
      setLoading(true);
      setError(null);

      // Step 1: Create registration
      const registrationResponse = await createRegistration(eventId, {
        ticketTypeId: registrationData.ticketTypeId,
        quantity: registrationData.quantity,
        formResponses: (registrationData as any).formResponses,
        couponCode: registrationData.couponCode,
      });

      // Step 2: Handle payment if required
      if (registrationResponse.razorpayOrderId) {
        // Open Razorpay checkout
        const paymentResponse = await openRazorpayCheckout({
          orderId: registrationResponse.razorpayOrderId,
          amount: registrationResponse.amount,
          currency: registrationResponse.currency || 'INR',
          name: 'Unifesto',
          description: eventTitle,
          image: eventBanner,
          prefill: {
            name: (registrationData as any).attendees?.[0]?.name || '',
            email: (registrationData as any).attendees?.[0]?.email || '',
            contact: (registrationData as any).attendees?.[0]?.mobile || '',
          },
          keyId: registrationResponse.razorpayKeyId,
        });
        // Step 3: Verify payment
        const verificationResponse = await verifyPayment(eventId, {
          registrationId: registrationResponse.registrationId || '',
          razorpayOrderId: paymentResponse.razorpay_order_id,
          razorpayPaymentId: paymentResponse.razorpay_payment_id,
          razorpaySignature: paymentResponse.razorpay_signature,
        });
        return {
          success: true,
          registrations: [],
          paymentId: verificationResponse.paymentId,
          requiresPayment: true,
        };
      } else {
        // Free event - no payment required
        return {
          success: true,
          registrations: registrationResponse.registrations,
          paymentId: null,
          requiresPayment: false,
        };
      }
    } catch (err: any) {
      if (__DEV__) console.error('Registration/Payment error:', err);
      const errorMessage = err.message || 'Registration failed. Please try again.';
      setError(errorMessage);
      
      // Show error alert
      AppAlert.alert('Registration Failed', errorMessage, [{ text: 'OK' }]);
      
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    processRegistration,
    loading,
    error,
  };
}
