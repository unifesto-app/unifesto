import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RazorpayCheckout from 'react-native-razorpay';
import { AppAlert } from '../components/ui/AppAlert';
import { makePublicRequest } from './api/helpers';
import { getUserIdentities } from './api/auth';

/**
 * Every Razorpay payment in the app goes through pay() (Q40).
 *
 * A UPI app picked at checkout opens straight away through Razorpay Custom UI
 * (UPI intent), with no sheet. "Cards, netbanking and more", and every
 * fallback, opens Razorpay Standard Checkout with UPI listed first. Either way
 * the result is the signed payment the backend verifies, and the webhook
 * settles it if the app dies mid-payment: the money path doesn't change.
 */

/** A Razorpay order as every create-order route returns it. */
export interface PayOrder {
  razorpayKeyId: string;
  razorpayOrderId: string;
  /** Paise. */
  amount: number;
  currency?: string;
}

/** What the buyer sees on the sheet and in the UPI app. */
export interface PayDetails {
  description: string;
  /** Sheet title; Unifesto unless the event is white-labelled. */
  name?: string;
  image?: string;
  color?: string;
  prefill: { name: string; email: string; contact: string };
}

/** A UPI app on this phone. `id` is what Razorpay takes back to open it. */
export interface UpiApp {
  id: string;
  name: string;
  /** Android only: the app's own icon as a data URI. */
  icon?: string;
}

/** A UPI app, or Razorpay's sheet ('more': cards, netbanking, wallets, any UPI). */
export type PayMethod = UpiApp | 'more';

export interface SignedPayment {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

const LAST_METHOD_KEY = 'pay:last-method';
const CANCELLED = { code: 0, description: 'Payment Cancelled' };

// The sheet as Standard Checkout shows it everywhere: UPI first, then the rest.
const UPI_FIRST = {
  display: {
    blocks: { upi: { name: 'Pay by UPI', instruments: [{ method: 'upi' }] } },
    sequence: ['block.upi'],
    preferences: { show_default_blocks: true },
  },
};

// Razorpay's iOS ids; Android names come from the phone.
const IOS_NAMES: Record<string, string> = { google_pay: 'Google Pay', phonepe: 'PhonePe', paytm: 'Paytm', cred: 'CRED', bhim: 'BHIM' };

/**
 * Custom UI is loaded defensively: binaries before 5.0.0 (and Expo Go) have no
 * native side, and importing it there throws on iOS. Then only the sheet shows.
 */
type CustomUi = typeof import('react-native-customui').default;
let customUi: CustomUi | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (NativeModules.RazorpayCustomui) customUi = require('react-native-customui').default as CustomUi;
} catch {
  customUi = null;
}

let installed: Promise<UpiApp[]> | null = null;

/**
 * The phone's UPI apps, asked once per launch. Not through the library's
 * getAppsWhichSupportUPI: when it answers, it drops every app-wide listener
 * for Razorpay::PAYMENT_*, react-native-razorpay's included, so a late answer
 * would strand an open sheet. Our own subscription removes only itself.
 */
function installedUpiApps(): Promise<UpiApp[]> {
  installed ??= new Promise<UpiApp[]>((resolve) => {
    const done = (apps: UpiApp[]) => {
      clearTimeout(timer);
      sub.remove();
      resolve(apps);
    };
    const sub = new NativeEventEmitter(NativeModules.RazorpayEventEmitterCustom).addListener(
      'Razorpay::UPI_APPS',
      (res: { data?: import('react-native-customui').UpiAppInfo[] }) =>
        done(
          (res?.data ?? []).map((a) => ({
            id: a.packageName || a.appName,
            name: Platform.OS === 'ios' ? IOS_NAMES[a.appName] ?? a.appName.replace(/_/g, ' ') : a.appName,
            icon: a.iconBase64 ? `data:image/png;base64,${a.iconBase64.replace(/\s/g, '')}` : undefined,
          })),
        ),
    );
    const timer = setTimeout(() => done([]), 4000);
    NativeModules.RazorpayCustomui.getAppsWhichSupportUpi();
  }).catch(() => []);
  return installed;
}

/** Q40's kill switch for this platform. Unreadable (offline, older API) or slow = off: the sheet. */
async function upiCheckoutOn(): Promise<boolean> {
  const read = makePublicRequest('/config/checkout')
    .then(async (res) => !!res?.ok && (await res.json())?.[Platform.OS] === true)
    .catch(() => false);
  return Promise.race([read, new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000))]);
}

/** The UPI app id (or 'more') the last successful payment on this phone used. */
const lastMethodId = () => AsyncStorage.getItem(LAST_METHOD_KEY).catch(() => null);

/**
 * What checkout can offer: UPI apps (last used first) and the method to
 * preselect. No apps = the switch is off, the currency isn't INR, or this
 * phone has none: then only the sheet.
 */
export async function checkoutMethods(currency = 'INR'): Promise<{ apps: UpiApp[]; selected: PayMethod }> {
  if (!customUi || currency !== 'INR' || !(await upiCheckoutOn())) return { apps: [], selected: 'more' };
  const [found, last] = await Promise.all([installedUpiApps(), lastMethodId()]);
  const apps = [...found].sort((a, b) => Number(b.id === last) - Number(a.id === last));
  return { apps, selected: last === 'more' || !apps.length ? 'more' : apps[0] };
}

/** Razorpay and the chooser report a dismissed payment as an error; it isn't one. Custom UI's Android back press is code 5. */
export function isPaymentCancelled(err: any): boolean {
  return err?.code === 0 || /cancel|back button/i.test(err?.description ?? '');
}

/** No summary screen to choose on: a short list. null = nothing to choose, so the sheet. */
async function chooseMethod(order: PayOrder): Promise<PayMethod | null> {
  const { apps } = await checkoutMethods(order.currency);
  if (!apps.length) return null;
  const amount = `₹${(order.amount / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  return new Promise((resolve, reject) =>
    AppAlert.alert(`Pay ${amount} with`, undefined, [
      ...apps.slice(0, 3).map((app) => ({ text: app.name, onPress: () => resolve(app) })),
      { text: 'Cards, netbanking and more', onPress: () => resolve('more') },
      { text: 'Cancel', style: 'cancel' as const, onPress: () => reject(CANCELLED) },
    ]),
  );
}

/** My primary email, so neither checkout has to ask for it. */
async function myEmail(): Promise<string> {
  try {
    const ids = await getUserIdentities();
    return (ids.find((i) => i.isPrimary && i.email) ?? ids.find((i) => i.email))?.email ?? '';
  } catch {
    return '';
  }
}

/**
 * Pays `order` with `method`, or asks how when there's no summary screen to
 * pick on. Resolves with the signed payment for the backend to verify; rejects
 * when the buyer cancels (see isPaymentCancelled) or the payment fails.
 */
export async function pay(order: PayOrder, details: PayDetails, method?: PayMethod): Promise<SignedPayment> {
  const chosen = method ?? (await chooseMethod(order));
  const prefill = { ...details.prefill, email: details.prefill.email || (await myEmail()) };
  const currency = order.currency || 'INR';
  const upiApp = chosen && chosen !== 'more' ? chosen : null;
  let payment: SignedPayment;
  // Razorpay needs both to start a UPI payment outside the sheet; the sheet asks.
  if (upiApp && customUi && currency === 'INR' && prefill.email && prefill.contact) {
    payment = await customUi.open({
      key_id: order.razorpayKeyId,
      order_id: order.razorpayOrderId,
      // Razorpay's sample sends paise as a string; the Android bridge turns numbers into doubles.
      amount: String(order.amount),
      currency,
      description: details.description,
      email: prefill.email,
      contact: prefill.contact,
      method: 'upi',
      '_[flow]': 'intent',
      upi_app_package_name: upiApp.id,
    });
  } else {
    // A UPI pick (or, with nothing picked, a UPI habit) opens the sheet on UPI.
    const upi = currency === 'INR' && (!!upiApp || (!chosen && ![null, 'more'].includes(await lastMethodId())));
    payment = (await RazorpayCheckout.open({
      key: order.razorpayKeyId,
      order_id: order.razorpayOrderId,
      amount: order.amount,
      currency,
      name: details.name || 'Unifesto',
      description: details.description,
      image: details.image,
      prefill: upi ? { ...prefill, method: 'upi' } : prefill,
      theme: { color: details.color || '#111113' },
      config: UPI_FIRST,
    })) as SignedPayment;
  }
  if (chosen) await AsyncStorage.setItem(LAST_METHOD_KEY, upiApp ? upiApp.id : 'more').catch(() => {});
  return payment;
}
