import { AppState, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RazorpayCheckout from 'react-native-razorpay';
import { AppAlert } from '../components/ui/AppAlert';
import { makePublicRequest } from './api/helpers';
import { getUserIdentities } from './api/auth';

/**
 * Every Razorpay payment in the app goes through pay() (Q40).
 *
 * A UPI app, UPI ID or wallet picked at checkout opens straight away through
 * Razorpay Custom UI, with no sheet. A card, or a pick Custom UI can't take
 * (no phone number, older binary, or it fails before anything opens), opens
 * Razorpay Standard Checkout showing only that method; "Cards, netbanking and more" opens the whole sheet, UPI
 * first. Either way the result is the signed payment the backend verifies,
 * and the webhook settles it if the app dies mid-payment: the money path
 * doesn't change.
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
  /** Android: the app's own icon as a data URI. iOS: Razorpay's logo for it. */
  icon?: string;
}

/** A wallet our Razorpay account takes. */
export interface PayOption {
  code: string;
  name: string;
}

/**
 * A UPI app; UPI in the sheet ('upi', Android when no app was found); a typed
 * UPI ID (a collect request, iOS only); a card (Razorpay's card form, nothing
 * else); a wallet ('' = not picked yet); or Razorpay's whole sheet ('more').
 */
export type PayMethod = UpiApp | 'upi' | { vpa: string } | 'card' | { wallet: string } | 'more';

/** What the payment page offers. `on` = Q40's switch is on and Custom UI is here. */
export interface CheckoutMethods {
  on: boolean;
  apps: UpiApp[];
  wallets: PayOption[];
  selected: PayMethod;
  /** Our public Razorpay key, to check a typed UPI ID before an order exists. None = no Verify. */
  keyId?: string;
}

export const CHECKOUT_OFF: CheckoutMethods = { on: false, apps: [], wallets: [], selected: 'more' };

/** How a method is remembered: the app id, 'upi', 'vpa:name@bank', 'card', 'more' or 'wallet:phonepe'. */
export const methodKey = (m: PayMethod) =>
  typeof m === 'string' ? m : 'id' in m ? m.id : 'vpa' in m ? `vpa:${m.vpa}` : `wallet:${m.wallet}`;

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

const BLOCK_NAMES: Record<string, string> = { card: 'Card', upi: 'UPI', wallet: 'Wallet' };
// The sheet for one picked method: that instrument and nothing else.
const onlyThis = (instrument: { method: string }) => ({
  display: {
    blocks: { only: { name: BLOCK_NAMES[instrument.method], instruments: [instrument] } },
    sequence: ['block.only'],
    preferences: { show_default_blocks: false },
  },
});

// Razorpay's iOS ids; Android names come from the phone.
const IOS_NAMES: Record<string, string> = {
  google_pay: 'Google Pay', phonepe: 'PhonePe', paytm: 'Paytm', cred: 'CRED', bhim: 'BHIM',
  amazonpay: 'Amazon Pay', mobikwik: 'MobiKwik', whatsapp: 'WhatsApp', sbiyono: 'SBI YONO', kotakbank: 'Kotak 811',
};
// iOS opens an app by its shortcode, but the list reaches us with names only.
// The SDK's own table (razorpay-customui-pod 2.2.4): these five, and every
// other app is its name in lower case without spaces.
const IOS_SHORTCODES: Record<string, string> = { 'Google Pay': 'google_pay', 'BoB World UPI': 'bobupi', IndusInd: 'indusmobile', PopClub: 'popclubapp', Kotak811: 'kotakbank' };
const iosShortcode = (name: string) => IOS_SHORTCODES[name] ?? name.toLowerCase().replace(/\s/g, '');
// iOS can't read another app's icon, so the logo Razorpay's own checkout shows: its CDN keeps one per shortcode, Kotak's under kotak811.
const iosLogo = (shortcode: string) => `https://cdn.razorpay.com/app/${shortcode === 'kotakbank' ? 'kotak811' : shortcode}.png`;
// The big three lead the list (iOS shortcodes, Android packages); every other
// app Razorpay finds follows in its order.
const TOP_UPI_APPS = ['google_pay', 'phonepe', 'paytm', 'com.google.android.apps.nbu.paisa.user', 'com.phonepe.app', 'net.one97.paytm'];
const upiRank = (a: UpiApp) => (TOP_UPI_APPS.includes(a.id) ? TOP_UPI_APPS.indexOf(a.id) : TOP_UPI_APPS.length);

/**
 * NPCI ended typed UPI IDs (collect) on 28 Feb 2026, except in iOS apps and
 * mobile web. Android lists every UPI app instead.
 */
export const CAN_TYPE_UPI_ID = Platform.OS === 'ios';

/** name@bank: a UPI ID worth sending to Razorpay, which checks it's real. */
export const isVpa = (v: string) => /^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(v);

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
          (res?.data ?? []).map((a) => {
            // iOS: appName is the SDK's { appName, shortcode } and the shortcode is the id.
            const ios = typeof a.appName === 'object' ? a.appName : null;
            const name = ios ? ios.appName : String(a.appName);
            const id = a.packageName || ios?.shortcode || (Platform.OS === 'ios' ? iosShortcode(name) : name);
            return {
              id,
              name: Platform.OS === 'ios' ? IOS_NAMES[id] ?? name.replace(/_/g, ' ') : name,
              icon: a.iconBase64
                ? `data:image/png;base64,${a.iconBase64.replace(/\s/g, '')}`
                : Platform.OS === 'ios'
                  ? iosLogo(id)
                  : undefined,
            };
          }),
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

type PayConfig = { wallets: PayOption[]; keyId?: string };

/** The wallets our Razorpay account takes, and our public key. Unreadable or slow = no wallets (UPI and cards only), no Verify. */
async function payConfig(): Promise<PayConfig> {
  const none: PayConfig = { wallets: [] };
  const read = makePublicRequest('/config/payment-methods')
    .then(async (res): Promise<PayConfig> => {
      const body = res?.ok ? await res.json() : null;
      return { wallets: body?.wallets ?? [], keyId: body?.keyId || undefined };
    })
    .catch(() => none);
  return Promise.race([read, new Promise<PayConfig>((resolve) => setTimeout(() => resolve(none), 3000))]);
}

/**
 * The check Razorpay's own SDK runs on a typed UPI ID (it needs only our
 * public key): the account holder's name ('' if Razorpay has none),
 * 'invalid' for an ID no bank knows, or null when Razorpay couldn't answer.
 * Pay works either way; Razorpay checks the ID again when it sends the request.
 */
export async function verifyUpiId(keyId: string, vpa: string): Promise<{ name: string } | 'invalid' | null> {
  const ask = fetch(`https://api.razorpay.com/v1/payments/validate/account?key_id=${encodeURIComponent(keyId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `entity=vpa&value=${encodeURIComponent(vpa)}`,
  })
    .then((res) => res.json())
    .then((body): { name: string } | 'invalid' | null => {
      if (body?.success === true) return { name: body.customer_name ?? '' };
      // Unknown ID: 200 with success false. Malformed ID: 400 invalid_vpa.
      return body?.success === false || body?.error?.reason === 'invalid_vpa' ? 'invalid' : null;
    })
    .catch(() => null);
  return Promise.race([ask, new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))]);
}

/** The methodKey() the last successful payment on this phone used. */
const lastMethodId = () => AsyncStorage.getItem(LAST_METHOD_KEY).catch(() => null);

/** The method paid with last time, while it's still on offer; else the first UPI app, else a UPI ID (iOS) or UPI. */
function preselect(last: string | null, apps: UpiApp[], wallets: PayOption[]): PayMethod {
  const [kind, code] = (last ?? '').split(':');
  if (kind === 'wallet' && wallets.some((w) => w.code === code)) return { wallet: code };
  if (kind === 'vpa' && CAN_TYPE_UPI_ID) return { vpa: code };
  if (last === 'card') return 'card';
  return apps[0] ?? (CAN_TYPE_UPI_ID ? { vpa: '' } : 'upi');
}

/**
 * What checkout can offer: UPI apps (last used first), wallets and the method
 * to preselect. Off = the switch is off, the currency isn't INR, or
 * this binary has no Custom UI: then only the sheet.
 */
export async function checkoutMethods(currency = 'INR'): Promise<CheckoutMethods> {
  if (!customUi || currency !== 'INR' || !(await upiCheckoutOn())) return CHECKOUT_OFF;
  const [found, last, { wallets, keyId }] = await Promise.all([installedUpiApps(), lastMethodId(), payConfig()]);
  const apps = [...found].sort((a, b) => Number(b.id === last) - Number(a.id === last) || upiRank(a) - upiRank(b));
  return { on: true, apps, wallets, keyId, selected: preselect(last, apps, wallets) };
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

/** Custom UI's options for a pick it pays without the sheet: a UPI app, a UPI ID or a wallet. */
function directOptions(m: PayMethod | null): Record<string, string> | null {
  if (!m || typeof m === 'string') return null;
  if ('id' in m) return { method: 'upi', '_[flow]': 'intent', upi_app_package_name: m.id };
  if ('vpa' in m) return isVpa(m.vpa) ? { method: 'upi', '_[flow]': 'collect', vpa: m.vpa } : null;
  return m.wallet ? { method: 'wallet', wallet: m.wallet } : null;
}

/** The one instrument the sheet shows for a pick it has to take. null = the whole sheet. */
function onlyInstrument(m: PayMethod | null): { method: string } | null {
  if (!m || m === 'more') return null;
  if (m === 'card') return { method: 'card' };
  if (m === 'upi' || 'id' in m || 'vpa' in m) return { method: 'upi' };
  return { method: 'wallet', ...(m.wallet && { wallets: [m.wallet] }) };
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
  // Razorpay needs both to pay outside the sheet; the sheet asks.
  const direct = customUi && currency === 'INR' && prefill.email && prefill.contact ? directOptions(chosen) : null;
  let payment: SignedPayment | null = null;
  if (customUi && direct) {
    // Left for the UPI app (or to approve the UPI ID's request) or wallet: what comes back is the buyer's answer.
    let left = false;
    const away = AppState.addEventListener('change', (state) => {
      if (state === 'background') left = true;
    });
    try {
      payment = await customUi.open({
        key_id: order.razorpayKeyId,
        order_id: order.razorpayOrderId,
        // Razorpay's sample sends paise as a string; the Android bridge turns numbers into doubles.
        amount: String(order.amount),
        currency,
        description: details.description,
        email: prefill.email,
        contact: prefill.contact,
        ...direct,
      });
    } catch (err: any) {
      // Custom UI's own Cancel (iOS) or back press (Android), or an answer from the app or wallet.
      if (left || /User Cancelled Payment|back button/i.test(err?.description ?? '')) throw err;
      // Custom UI failed before anything opened: say why, then pay the same pick in the sheet.
      console.warn('[pay] Custom UI failed, opening the sheet', err);
      Sentry.captureMessage(`Custom UI failed (${direct.method}): ${err?.code} ${err?.description ?? ''}`, 'warning');
    } finally {
      away.remove();
    }
  }
  if (!payment) {
    const only = onlyInstrument(chosen);
    // A UPI pick (or, with nothing picked, a UPI habit) opens the sheet on UPI.
    const last = chosen ? null : await lastMethodId();
    const upiHabit = !!last && last !== 'more' && last !== 'card' && !last.includes(':');
    const upi = currency === 'INR' && (only?.method === 'upi' || upiHabit);
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
      config: only ? onlyThis(only) : UPI_FIRST,
    })) as SignedPayment;
  }
  if (chosen) await AsyncStorage.setItem(LAST_METHOD_KEY, methodKey(chosen)).catch(() => {});
  return payment;
}
