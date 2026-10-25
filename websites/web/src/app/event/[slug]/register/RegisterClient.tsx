"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BrandTheme, brandStyle } from "@/components/BrandedChrome";
import { registrationState, type Event } from "@/lib/api/events";
import {
  ApiError,
  confirmAge,
  createOrder,
  getQuote,
  INDIAN_STATES,
  myRegistrations,
  resendTicket,
  saveName,
  sendEmailCode,
  sendPhoneCode,
  verifyEmailCode,
  validateCoupon,
  verifyPayment,
  verifyPhoneCode,
  visibleFieldIds,
  type AuthResponse,
  type FormField,
  type Quote,
  type RegTicket,
} from "@/lib/api/registration";
import { clearSession, getSession, setSession, type WebSession } from "@/lib/auth";
import { openAppOrStore, storeUrlFor } from "@/lib/appLinks";
import { storedUtm, withStoredUtm } from "@/lib/utm";

const FIELD =
  "w-full rounded-3xl bg-canvas px-4 py-3 text-sm text-paper placeholder:text-paper/55 focus:outline-none focus:ring-1 focus:ring-primary/50";
const CHOICE = "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors";
const NOT_OPEN = { upcoming: "Registration opens soon", sold_out: "Sold out", closed: "Registration closed", open: "" } as const;

const noopSubscribe = () => () => {};

type Step = "form" | "email-otp" | "phone" | "phone-otp" | "done";
type Done = { kind: "in" | "already" | "waitlisted" | "confirming"; registrationId?: string };

/** ₹ from paise: "₹499", "₹524.95". */
const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

interface RazorpayPayment {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
declare global {
  interface Window {
    // Razorpay Standard Checkout (checkout.razorpay.com/v1/checkout.js).
    Razorpay?: new (options: Record<string, unknown>) => { open(): void };
  }
}

interface Props {
  event: Event;
  tickets: RegTicket[];
  fields: FormField[];
}

export default function RegisterClient({ event, tickets, fields }: Props) {
  const [now] = useState(() => Date.now());
  const appLink = `unifesto://event/${event.slug}`;

  // Tickets I can pick right now: on sale, and not sold out unless they queue.
  const onSale = tickets.filter(
    (t) =>
      (!t.saleStartsAt || Date.parse(t.saleStartsAt) <= now) &&
      (!t.saleEndsAt || Date.parse(t.saleEndsAt) >= now) &&
      (t.totalQuantity == null || t.soldCount < t.totalQuantity || t.waitlistEnabled),
  );
  // Group tickets need a team roster, which lives in the app.
  const individual = onSale.filter((t) => t.kind !== "GROUP");
  const groupInApp = individual.length < onSale.length;
  const status = event.status?.toUpperCase();
  const isOver = status !== "PUBLISHED" || new Date(event.end_date || event.start_date).getTime() < now;
  const appliesTo = (f: FormField, ticketId: string) => !f.ticketTypeId || f.ticketTypeId === ticketId;

  // Anything the web can't do yet hands off to the app with an honest reason.
  let handoff: { title: string; body: string; app: boolean } | null = null;
  if (isOver) handoff = { title: "Registration is closed", body: "This event is no longer taking registrations.", app: false };
  else if (!tickets.length && event.sub_events?.length)
    handoff = { title: "Pick an event inside", body: "Registration happens for each event inside this one.", app: false };
  else if (!onSale.length)
    handoff = { title: NOT_OPEN[registrationState(event.tickets, now)] || "Registration is not open", body: "Check back on the event page.", app: false };
  else if (!individual.length)
    handoff = { title: "Group tickets are in the app for now", body: "Register your team in the Unifesto app.", app: true };
  else if (fields.some((f) => f.type === "FILE" && individual.some((t) => appliesTo(f, t.id))))
    handoff = { title: "Finish in the app", body: "This registration asks for a file upload, which works in the Unifesto app.", app: true };

  // The stored session is read after hydration (the server has none); signing
  // in or out overrides it.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [sessionOverride, setSessionState] = useState<WebSession | null | undefined>(undefined);
  const session = sessionOverride !== undefined ? sessionOverride : hydrated ? getSession() : null;
  const [ticketId, setTicketIdState] = useState(individual[0]?.id ?? "");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [couponInput, setCouponInput] = useState("");
  // discountPaise null = not checked yet (signed out); create-order checks it either way.
  const [coupon, setCoupon] = useState<{ code: string; discountPaise: number | null } | null>(null);
  const [couponMsg, setCouponMsg] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [resent, setResent] = useState("");

  const ticket = individual.find((t) => t.id === ticketId);
  const paid = !!ticket && ticket.price > 0;
  const basePaise = Math.round((ticket?.price ?? 0) * 100);
  const discountPaise = Math.min(coupon?.discountPaise ?? 0, basePaise);
  const setTicketId = (id: string) => {
    setTicketIdState(id);
    setCoupon(null);
    setCouponMsg("");
  };

  // Price from the server's fee rules (T5), never computed here. Debounced so
  // flipping between tickets doesn't fire a call per click.
  useEffect(() => {
    if (!paid) return;
    let live = true;
    const t = setTimeout(() => {
      getQuote(event.id, basePaise, discountPaise)
        .then((q) => live && setQuote(q))
        .catch(() => live && setQuote(null));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [paid, event.id, basePaise, discountPaise]);
  // Only a quote for what is on screen right now.
  const shown = paid && quote?.basePaise === basePaise && quote.couponDiscountPaise === discountPaise ? quote : null;

  // A returning visitor who already holds a ticket sees it, not the form.
  useEffect(() => {
    const s = getSession();
    if (!s || handoff) return;
    myRegistrations(event.id, s.token)
      .then((regs) => {
        if (regs.length) {
          setDone({ kind: "already", registrationId: regs[0].id });
          setStep("done");
        }
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          clearSession();
          setSessionState(null);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ticketFields = fields.filter((f) => appliesTo(f, ticketId)).sort((a, b) => a.order - b.order);
  const visible = visibleFieldIds(ticketFields, answers);
  const answer = (id: string, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }));
  const mobileNumber = `+91${phone}`;

  const run = (fn: () => Promise<void>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  const goTo = (s: Step) => {
    setOtp("");
    setError("");
    setStep(s);
  };

  /** Signed in: register for the chosen ticket with the same call the app makes. */
  const register = async (s: WebSession) => {
    try {
      const mine = await myRegistrations(event.id, s.token);
      if (mine.length) {
        setDone({ kind: "already", registrationId: mine[0].id });
        return goTo("done");
      }
      // Z11: the 18+ box is required on the form; record it before registering.
      await confirmAge(s.token);
      const formResponses = Object.fromEntries(Object.entries(answers).filter(([id]) => visible.has(id)));
      const res = await createOrder(event.id, s.token, {
        ticketTypeId: ticketId,
        formResponses,
        couponCode: coupon?.code,
        ...storedUtm(),
      });
      if (res.isWaitlisted) setDone({ kind: "waitlisted" });
      else if (!res.razorpayOrderId) setDone({ kind: "in", registrationId: res.registrationId });
      else {
        // The pending registration lives server-side; paying again calls
        // create-order again, which cancels this attempt first (S13).
        const payment = await pay(res.razorpayKeyId!, res.razorpayOrderId, res.amount, res.currency, s);
        try {
          await verifyPayment(event.id, s.token, {
            registrationId: res.registrationId,
            razorpayOrderId: payment.razorpay_order_id,
            razorpayPaymentId: payment.razorpay_payment_id,
            razorpaySignature: payment.razorpay_signature,
          });
          setDone({ kind: "in", registrationId: res.registrationId });
        } catch {
          // Money is taken: never offer "pay again". The payment webhook
          // settles the ticket even when this confirmation call fails.
          setDone({ kind: "confirming" });
        }
      }
      goTo("done");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearSession();
        setSessionState(null);
        goTo("form");
        throw new Error("Your sign-in expired. Enter your email to continue.");
      }
      throw e;
    }
  };

  /** Razorpay Standard Checkout: resolves with the signed payment, rejects when closed unpaid. */
  const pay = (key: string, orderId: string, amount: number, currency: string, s: WebSession) =>
    new Promise<RazorpayPayment>((resolve, reject) => {
      if (!window.Razorpay) return reject(new Error("Payment didn't load. Check your connection and try again."));
      new window.Razorpay({
        key,
        order_id: orderId,
        amount,
        currency,
        name: event.branding?.name ? event.space?.name || "Unifesto" : "Unifesto",
        description: event.title,
        prefill: { name: s.fullName || "", email: s.email, contact: phone ? mobileNumber : "" },
        theme: { color: event.branding?.color || "#3491ff" },
        handler: resolve,
        // A failed attempt stays inside the sheet so the buyer can try another
        // method; only closing it ends this attempt.
        modal: { ondismiss: () => reject(new Error("Payment not completed. Nothing was charged. Try again when you're ready.")) },
      }).open();
    });

  const applyCoupon = run(async () => {
    const code = couponInput.trim();
    setCouponMsg("");
    if (!code) return setCoupon(null);
    if (!session) {
      // Codes are checked against my account, so before sign-in the code rides
      // along to checkout, which applies or rejects it.
      setCoupon({ code, discountPaise: null });
      return setCouponMsg(`${code.toUpperCase()} is checked when you pay.`);
    }
    setCoupon(null);
    const q = await validateCoupon(event.id, session.token, code, ticketId);
    setCoupon({ code: q.code, discountPaise: Math.round(q.discount * 100) });
    setCouponMsg(`${q.code} applied.`);
  });

  /** After the code checks out: name a fresh account, keep the session, register. */
  const signedIn = async (auth: AuthResponse) => {
    const s: WebSession = { token: auth.accessToken, email: email.trim(), fullName: auth.user?.fullName || null };
    if (!s.fullName && fullName.trim()) {
      await saveName(fullName.trim(), s.token);
      s.fullName = fullName.trim();
    }
    setSession(s);
    setSessionState(s);
    // Signed in now, so a rejected answer is fixed back on the form.
    await register(s).catch((e) => {
      goTo("form");
      throw e;
    });
  };

  const submitForm = run(async () => {
    if (session) {
      if (!session.fullName && fullName.trim()) {
        await saveName(fullName.trim(), session.token);
        const s = { ...session, fullName: fullName.trim() };
        setSession(s);
        setSessionState(s);
      }
      return register(session);
    }
    await sendEmailCode(email.trim());
    goTo("email-otp");
  });
  const verifyEmail = run(async () => {
    const res = await verifyEmailCode(email.trim(), otp.trim());
    if (res.requiresMobileVerification && res.tempToken) {
      setTempToken(res.tempToken);
      goTo("phone");
    } else await signedIn(res);
  });
  const sendPhone = run(async () => {
    if (!/^[0-9]{10}$/.test(phone)) throw new Error("Enter a 10 digit mobile number.");
    await sendPhoneCode(mobileNumber, tempToken);
    goTo("phone-otp");
  });
  const verifyPhone = run(async () => signedIn(await verifyPhoneCode(mobileNumber, otp.trim(), tempToken)));
  const signOut = () => {
    clearSession();
    setSessionState(null);
  };

  const openApp = (link: string) => openAppOrStore(withStoredUtm(link));
  const back = (
    <Link href={`/event/${event.slug}`} className="link-draw text-sm text-paper/65">
      Back to event
    </Link>
  );

  let body: ReactNode;
  if (handoff) {
    body = (
      <div className="text-center">
        <h2 className="font-display text-2xl text-paper">{handoff.title}</h2>
        <p className="mt-3 text-paper/70">{handoff.body}</p>
        {handoff.app && (
          <button type="button" onClick={() => openApp(appLink)} className="btn btn-lg btn-primary mt-8 w-full">
            Open in the Unifesto app
          </button>
        )}
        <div className="mt-5">{back}</div>
      </div>
    );
  } else if (step === "done" && done) {
    const ticketText = "Your ticket and QR code are in your email and in the Unifesto app under My tickets.";
    const { title, text } = {
      in: { title: "You're in", text: ticketText },
      already: { title: "You're already in", text: ticketText },
      waitlisted: { title: "You're on the waiting list", text: "We'll let you know by email if a spot opens up. Nothing has been charged." },
      confirming: {
        title: "Payment received",
        text: "We're confirming it now. Your ticket reaches your email and My tickets in the app within a few minutes. Please don't pay again.",
      },
    }[done.kind];
    body = (
      <div className="animate-pop-in text-center">
        <h2 className="font-display text-2xl text-paper">{title}</h2>
        <p className="mt-3 text-paper/70">{text}</p>
        <button
          type="button"
          onClick={() => openApp(done.registrationId ? `unifesto://ticket/${done.registrationId}` : appLink)}
          className="btn btn-lg btn-primary mt-8 w-full"
        >
          Open My tickets in the app
        </button>
        {done.kind === "already" && done.registrationId && session && (
          <div className="mt-5">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const r = await resendTicket(done.registrationId!, session.token);
                  setResent(r.email ? `Sent to ${r.email}.` : "Sent.");
                })()
              }
              className="btn btn-secondary w-full"
            >
              {busy ? "Sending…" : "Resend my ticket"}
            </button>
            {(resent || error) && <p className={`mt-2 text-sm ${error ? "text-red-400" : "text-paper/65"}`}>{error || resent}</p>}
          </div>
        )}
        <Link href="/tickets" className="link-draw mt-5 inline-block text-sm text-paper/65">
          See My tickets on the web
        </Link>
        <br />
        <a href={storeUrlFor()} className="link-draw mt-3 inline-block text-sm text-paper/65">
          No app yet? Get it free
        </a>
        <div className="mt-3">{back}</div>
      </div>
    );
  } else if (step === "phone") {
    body = (
      <form onSubmit={sendPhone} className="space-y-4">
        <p className="text-paper/75">New to Unifesto? Add your WhatsApp number to create your account.</p>
        <div className="flex items-center rounded-3xl bg-canvas">
          <span className="pl-4 text-sm text-paper/65">+91</span>
          <input
            required
            autoFocus
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            aria-label="Mobile number"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="Mobile number (WhatsApp)"
            className="w-full bg-transparent px-3 py-3 text-sm text-paper placeholder:text-paper/55 focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? "Sending code…" : "Send WhatsApp code"}
        </button>
      </form>
    );
  } else if (step === "email-otp" || step === "phone-otp") {
    const isEmail = step === "email-otp";
    body = (
      <form onSubmit={isEmail ? verifyEmail : verifyPhone} className="space-y-4">
        <p className="text-paper/75">
          {isEmail ? "We emailed a code to " : "We sent a WhatsApp code to "}
          <strong className="text-paper">{isEmail ? email.trim() : `+91 ${phone}`}</strong>.
        </p>
        <input
          key={step}
          required
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Verification code"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          placeholder="Verification code"
          className={FIELD}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? "Verifying…" : paid ? "Verify and pay" : "Verify and register"}
        </button>
        <div className="flex justify-between text-sm text-paper/65">
          <button type="button" onClick={() => goTo(isEmail ? "form" : "phone")} className="hover:text-paper">
            {isEmail ? "Change email" : "Change number"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={run(() => (isEmail ? sendEmailCode(email.trim()) : sendPhoneCode(mobileNumber, tempToken)).then(() => undefined))}
            className="hover:text-paper"
          >
            Resend code
          </button>
        </div>
      </form>
    );
  } else {
    body = (
      <form onSubmit={submitForm} className="space-y-6">
        {individual.length > 1 ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold text-paper">Ticket</legend>
            {individual.map((t) => (
              <label key={t.id} className={`${CHOICE} ${ticketId === t.id ? "border-primary bg-primary/10" : "border-paper/10"}`}>
                <input type="radio" name="ticket" checked={ticketId === t.id} onChange={() => setTicketId(t.id)} className="sr-only" />
                <span className="flex-1">
                  <span className="block font-semibold text-paper">{t.name}</span>
                  {t.description && <span className="block text-paper/60">{t.description}</span>}
                </span>
                <span className="font-semibold text-paper">{t.price > 0 ? inr(Math.round(t.price * 100)) : "Free"}</span>
              </label>
            ))}
          </fieldset>
        ) : (
          <p className="text-sm text-paper/70">
            <span className="font-semibold text-paper">{individual[0].name}</span> · {paid ? inr(basePaise) : "Free"}
          </p>
        )}
        {groupInApp && <p className="text-xs text-paper/55">Group tickets are in the Unifesto app.</p>}

        {ticketFields.some((f) => visible.has(f.id)) && (
          <div className="space-y-5">
            {ticketFields
              .filter((f) => visible.has(f.id))
              .map((f) => (
                <Question key={f.id} field={f} value={answers[f.id]} onChange={(v) => answer(f.id, v)} />
              ))}
          </div>
        )}

        <div className="space-y-3">
          {session ? (
            <p className="text-sm text-paper/65">
              Registering as <strong className="text-paper">{session.email}</strong>.{" "}
              <button type="button" onClick={signOut} className="underline hover:text-paper">
                Not you?
              </button>
            </p>
          ) : (
            <p className="text-sm text-paper/65">We email you a code to confirm it&apos;s you. Already on Unifesto? Use the same email.</p>
          )}
          {!session?.fullName && (
            <input
              required
              maxLength={255}
              autoComplete="name"
              aria-label="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              className={FIELD}
            />
          )}
          {!session && (
            <input
              required
              type="email"
              autoComplete="email"
              aria-label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className={FIELD}
            />
          )}
        </div>

        {paid && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                maxLength={64}
                aria-label="Discount code"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCoupon();
                  }
                }}
                placeholder="Discount code (optional)"
                className={FIELD}
              />
              <button
                type="button"
                disabled={busy || !couponInput.trim()}
                onClick={() => applyCoupon()}
                className="btn btn-secondary shrink-0"
              >
                Apply
              </button>
            </div>
            {couponMsg && <p className="text-xs text-paper/65">{couponMsg}</p>}
            <dl className="space-y-1.5 rounded-2xl border border-paper/10 px-4 py-3 text-sm">
              <PriceLine label="Ticket" value={inr(basePaise)} />
              {!!shown?.couponDiscountPaise && <PriceLine label="Discount" value={`-${inr(shown.couponDiscountPaise)}`} />}
              {!!shown?.buyerFeePaise && <PriceLine label="Booking fee" value={inr(shown.buyerFeePaise)} />}
              <PriceLine label="Total" value={shown ? inr(shown.totalPaise) : "…"} strong />
            </dl>
          </div>
        )}

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-paper/80">
            <input type="checkbox" required className="mt-0.5 h-4 w-4 accent-primary" />
            <span>I am 18 or older</span>
          </label>
          <p className="mt-2 pl-7 text-xs text-paper/55">
            Under 18? Ask the organiser to register you through a parent or guardian.
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-lg btn-primary w-full">
          {busy
            ? "One moment…"
            : !session
              ? "Continue"
              : !paid || shown?.totalPaise === 0
                ? "Register"
                : shown
                  ? `Pay ${inr(shown.totalPaise)}`
                  : "Pay"}
        </button>
        <p className="text-center text-xs text-paper/50">
          By registering you agree to the{" "}
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          {paid && (
            <>
              , and the{" "}
              <Link href="/refund" className="underline">
                Refund Policy
              </Link>
            </>
          )}
          .
        </p>
      </form>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas" style={brandStyle(event.branding)}>
      <BrandTheme branding={event.branding} />
      {individual.some((t) => t.price > 0) && (
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      )}
      <Navbar />
      <section className="px-5 pb-24 pt-28 sm:px-8 md:pt-32">
        <div className="mx-auto max-w-xl">
          <p className="text-sm text-paper/55">Register for</p>
          <h1 className="mt-1 font-display text-[clamp(1.5rem,3vw,2.2rem)] leading-tight text-paper [text-wrap:balance]">
            {event.title}
          </h1>
          <div className="mt-8 rounded-3xl bg-night-2 p-6 sm:p-8">{body}</div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function PriceLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "pt-1 font-semibold text-paper" : "text-paper/70"}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** One registration question. Answers use the shapes the backend's checkAnswers accepts. */
function Question({ field: f, value, onChange }: { field: FormField; value: unknown; onChange: (v: unknown) => void }) {
  if (f.type === "SECTION") {
    return (
      <div className="pt-2">
        <h3 className="text-base font-semibold text-paper">{f.label}</h3>
        {f.helpText && <p className="mt-1 text-sm text-paper/60">{f.helpText}</p>}
      </div>
    );
  }
  const c = f.config ?? {};
  const str = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const label = (
    <span className="mb-2 block text-sm font-semibold text-paper">
      {f.label}
      {!f.isRequired && <span className="font-normal text-paper/50"> (optional)</span>}
    </span>
  );
  const help = f.helpText ? <span className="mt-1.5 block text-xs text-paper/55">{f.helpText}</span> : null;
  const choices = (opts: { label: string; value: unknown }[], multi = false) => (
    <fieldset className="space-y-2">
      <legend>{label}</legend>
      {opts.map((o) => {
        const picked = multi ? Array.isArray(value) && value.includes(o.value) : value === o.value;
        return (
          <label key={o.label} className={`${CHOICE} ${picked ? "border-primary bg-primary/10" : "border-paper/10"}`}>
            <input
              type={multi ? "checkbox" : "radio"}
              name={f.id}
              required={!multi && f.isRequired}
              checked={picked}
              onChange={() => {
                if (!multi) return onChange(o.value);
                const cur = Array.isArray(value) ? value : [];
                onChange(picked ? cur.filter((x) => x !== o.value) : [...cur, o.value]);
              }}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            <span className="text-paper">{o.label}</span>
          </label>
        );
      })}
      {help}
    </fieldset>
  );
  const opts = (xs: string[]) => xs.map((x) => ({ label: x, value: x }));

  switch (f.type) {
    case "RADIO":
      return choices(opts(f.options));
    case "YES_NO":
      return choices([{ label: "Yes", value: true }, { label: "No", value: false }]);
    case "RATING":
      return choices(Array.from({ length: c.scale === 10 ? 10 : 5 }, (_, i) => ({ label: String(i + 1), value: i + 1 })));
    case "CHECKBOX":
      if (f.options.length) return choices(opts(f.options), true);
      return (
        <label className="flex cursor-pointer items-start gap-3 text-sm text-paper">
          <input
            type="checkbox"
            required={f.isRequired}
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
          />
          <span>
            {f.label}
            {help}
          </span>
        </label>
      );
    case "SELECT":
    case "STATE":
      return (
        <label className="block">
          {label}
          <select required={f.isRequired} value={str} onChange={(e) => onChange(e.target.value)} className={FIELD}>
            <option value="">Choose one</option>
            {(f.type === "STATE" ? INDIAN_STATES : f.options).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {help}
        </label>
      );
    case "TEXTAREA":
      return (
        <label className="block">
          {label}
          <textarea
            rows={4}
            required={f.isRequired}
            minLength={c.minLength}
            maxLength={c.maxLength ?? 5000}
            value={str}
            onChange={(e) => onChange(e.target.value)}
            className={FIELD}
          />
          {help}
        </label>
      );
    default: {
      const type = ({ EMAIL: "email", PHONE: "tel", NUMBER: "number", DATE: "date" } as Record<string, string>)[f.type] ?? "text";
      return (
        <label className="block">
          {label}
          <input
            type={type}
            required={f.isRequired}
            minLength={c.minLength}
            maxLength={type === "text" ? (c.maxLength ?? 500) : undefined}
            min={f.type === "DATE" ? c.minDate : c.min}
            max={f.type === "DATE" ? c.maxDate : c.max}
            value={str}
            onChange={(e) => onChange(e.target.value)}
            className={FIELD}
          />
          {help}
        </label>
      );
    }
  }
}
