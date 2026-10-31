"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const FIELD =
  "w-full rounded-lg bg-night-2 px-4 py-3 text-sm text-white placeholder:text-paper/55 focus:border-primary/50 focus:outline-none";
const CTA = "btn btn-primary";

/* K11: visible labels (placeholders were doing the labelling and vanished on type). */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-paper/75">{label}</span>
      {children}
    </label>
  );
}

const TYPES = [
  { value: "REGULAR", title: "Regular", body: "A community, club or startup" },
  { value: "SUPER", title: "Super", body: "A university, college or institution" },
] as const;

type AuthResponse = {
  accessToken: string;
  requiresMobileVerification?: boolean;
  tempToken?: string;
  user?: { fullName?: string | null };
};

/** Send JSON to the backend; throws the backend's message on failure. */
async function call<T>(method: string, path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message[0] : data?.message;
    throw new Error(msg || "Something went wrong. Please try again.");
  }
  return data as T;
}

/**
 * A space belongs to an account (the requester becomes its Space Admin), so we
 * run the app's signup inline: email OTP, then WhatsApp OTP on the phone
 * (verify-mobile creates the account), then save their name and create it with
 * that token. An email that already has a verified account gets its token
 * straight from the email step, so the phone step is skipped. Q29: the space
 * is live at once, marked Unverified.
 *
 * `kind="event"` hosts one event without a space instead (Assist D7): same
 * signup, event basics in place of the space, made as a draft in a new space.
 *
 * `kind="orbit"` is the Unifesto Orbit Lead application (/orbit/apply): same
 * signup, then campus and clubs. Appointing needs an account, so this is it.
 */
export default function RequestSpaceClient({ kind = "space" }: { kind?: "space" | "event" | "orbit" }) {
  const isEvent = kind === "event";
  const isOrbit = kind === "orbit";
  const [campuses, setCampuses] = useState<{ id: string; name: string; city: string | null; open: boolean }[]>([]);
  useEffect(() => {
    if (!isOrbit) return;
    fetch(`${API_URL}/orbit/campuses`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setCampuses)
      .catch(() => setCampuses([]));
  }, [isOrbit]);
  const [form, setForm] = useState({
    campusId: "",
    collegeName: "",
    yearOfStudy: "",
    myClubs: "",
    campusClubs: "",
    why: "",
    spaceName: "",
    eventTitle: "",
    eventType: "IN_PERSON" as "IN_PERSON" | "ONLINE",
    start: "",
    end: "",
    description: "",
    type: "REGULAR" as "REGULAR" | "SUPER",
    city: "",
    websiteUrl: "",
    requesterRole: "",
    fullName: "",
    email: "",
    phone: "",
  });
  const [authorised, setAuthorised] = useState(false);
  const [step, setStep] = useState<"details" | "email-otp" | "phone-otp" | "done">("details");
  const [otp, setOtp] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const email = form.email.trim();
  const mobileNumber = `+91${form.phone}`;

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

  const goTo = (s: typeof step) => {
    setOtp("");
    setError("");
    setStep(s);
  };

  /** Signed in: fill the name on a fresh account, then file the request. */
  const submit = async ({ accessToken, user }: AuthResponse) => {
    if (!user?.fullName) {
      await call("PATCH", "/users/me", { fullName: form.fullName.trim() }, accessToken);
    }
    if (isOrbit) {
      const campus = campuses.find((c) => c.id === form.campusId);
      await call(
        "POST",
        "/orbit/applications",
        {
          spaceId: campus?.id,
          collegeName: campus ? campus.name : form.collegeName.trim(),
          yearOfStudy: form.yearOfStudy,
          myClubs: form.myClubs.trim(),
          campusClubs: form.campusClubs.trim(),
          why: form.why.trim(),
          confirmed: authorised,
        },
        accessToken,
      );
      goTo("done");
      return;
    }
    if (isEvent) {
      await call(
        "POST",
        "/spaces/event-requests",
        {
          title: form.eventTitle.trim(),
          description: form.description.trim() || undefined,
          type: form.eventType,
          startDateTime: new Date(form.start).toISOString(),
          endDateTime: new Date(form.end).toISOString(),
          city: form.city.trim() || undefined,
        },
        accessToken,
      );
      goTo("done");
      return;
    }
    const website = form.websiteUrl.trim();
    await call(
      "POST",
      "/spaces/request",
      {
        name: form.spaceName.trim(),
        description: form.description.trim(),
        type: form.type,
        city: form.city.trim() || undefined,
        websiteUrl: website ? (/^https?:\/\//.test(website) ? website : `https://${website}`) : undefined,
        requesterRole: form.requesterRole.trim() || undefined,
        authorityConfirmed: authorised,
      },
      accessToken,
    );
    goTo("done");
  };

  const sendEmailCode = run(async () => {
    if (!/^[0-9]{10}$/.test(form.phone)) throw new Error("Enter a 10 digit mobile number.");
    if (isEvent && new Date(form.end) <= new Date(form.start)) throw new Error("The event has to end after it starts.");
    if (isOrbit) {
      if (!form.campusId) throw new Error("Pick your campus, or choose \"My college isn't listed\".");
      if (!authorised) throw new Error("Confirm you are 18 or older and agree to the Privacy Policy.");
    } else if (!isEvent && !authorised) throw new Error("Confirm you are authorised to represent this organisation.");
    await call("POST", "/auth/email", { email });
    goTo("email-otp");
  });

  const sendPhoneCode = (token: string) =>
    call("POST", "/auth/mobile/send-otp", { mobileNumber, tempToken: token });

  const verifyEmail = run(async () => {
    const res = await call<AuthResponse>("POST", "/auth/email/verify", { email, otp: otp.trim() });
    if (res.requiresMobileVerification && res.tempToken) {
      setTempToken(res.tempToken);
      await sendPhoneCode(res.tempToken);
      goTo("phone-otp");
    } else {
      await submit(res);
    }
  });

  const verifyPhone = run(async () => {
    const res = await call<AuthResponse>("POST", "/auth/verify-mobile", {
      mobileNumber,
      otp: otp.trim(),
      tempToken,
    });
    await submit(res);
  });

  const resendPhoneCode = run(() => sendPhoneCode(tempToken).then(() => undefined));

  if (step === "done" && isOrbit) {
    return (
      <div className="animate-pop-in text-center">
        <h2 className="text-2xl font-bold">Application sent</h2>
        <p className="mt-2 text-paper/65">
          Thanks, {form.fullName.trim().split(" ")[0] || "there"}. Our Program Lead reviews every application and gets back
          to you at <strong className="text-white">{email}</strong>. Questions? Write to orbit@unifesto.app.
        </p>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="animate-pop-in text-center">
        <h2 className="text-2xl font-bold">{isEvent ? "Your event is ready" : "Your space is live"}</h2>
        <p className="mt-2 text-paper/65">
          {isEvent ? (
            <>
              <strong className="text-white">{form.eventTitle}</strong> is a draft in your new space. Add tickets, then
              publish.
            </>
          ) : (
            <>
              <strong className="text-white">{form.spaceName}</strong> is live, marked Unverified until we confirm who runs
              it. Create your first event now.
            </>
          )}{" "}
          Sign in with {email} in the Unifesto app or here.
        </p>
        <Link href="/console" className={`${CTA} mt-6`}>
          Open the console
        </Link>
      </div>
    );
  }

  if (step === "email-otp" || step === "phone-otp") {
    const isEmail = step === "email-otp";
    return (
      <form onSubmit={isEmail ? verifyEmail : verifyPhone} className="space-y-4">
        <p className="text-sm text-paper/55">Step {isEmail ? 1 : 2} of 2</p>
        <p className="text-paper/75">
          {isEmail ? "We emailed a code to " : "We sent a WhatsApp code to "}
          <strong className="text-white">{isEmail ? email : `+91 ${form.phone}`}</strong>.
        </p>
        <Field label="Verification code">
          <input
            key={step}
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            className={FIELD}
          />
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className={CTA}>
          {busy
            ? "Verifying…"
            : isEmail
              ? "Verify email"
              : isOrbit
                ? "Verify phone and send request"
                : `Verify phone and create the ${isEvent ? "event" : "space"}`}
        </button>
        <div className="flex justify-between text-sm text-paper/65">
          <button type="button" onClick={() => goTo("details")} className="hover:text-white">
            Change details
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={isEmail ? sendEmailCode : resendPhoneCode}
            className="hover:text-white"
          >
            Resend code
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={sendEmailCode} className="space-y-4">
      {isOrbit ? (
        <>
          <h2 className="pt-2 text-lg font-bold">Your campus</h2>
          <Field label="Campus">
            <select
              required
              value={form.campusId}
              onChange={(e) => set("campusId", e.target.value)}
              className={FIELD}
            >
              <option value="">Choose your campus</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.city ? `, ${c.city}` : ""}
                  {c.open ? "" : " (has a Lead)"}
                </option>
              ))}
              <option value="other">My college isn&apos;t listed</option>
            </select>
          </Field>
          {form.campusId === "other" && (
            <Field label="College name">
              <input
                required
                maxLength={200}
                value={form.collegeName}
                onChange={(e) => set("collegeName", e.target.value)}
                placeholder="Full name and city"
                className={FIELD}
              />
            </Field>
          )}
          <Field label="Year of study">
            <select
              required
              value={form.yearOfStudy}
              onChange={(e) => set("yearOfStudy", e.target.value)}
              className={FIELD}
            >
              <option value="">Choose your year</option>
              {["1st year", "2nd year", "3rd year", "4th year", "5th year", "Postgraduate"].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Clubs or fest teams you are part of, and your role">
            <textarea
              required
              rows={2}
              minLength={2}
              maxLength={1000}
              value={form.myClubs}
              onChange={(e) => set("myClubs", e.target.value)}
              className={FIELD}
            />
          </Field>
          <Field label="Active clubs on your campus (aim for 15)">
            <textarea
              required
              rows={6}
              minLength={20}
              maxLength={4000}
              value={form.campusClubs}
              onChange={(e) => set("campusClubs", e.target.value)}
              placeholder={"One per line, with their next event if you know it.\nCoding Club: hackathon in January\nDance Club: annual showcase"}
              className={FIELD}
            />
          </Field>
          <Field label="Why you want to be your campus's Orbit Lead">
            <textarea
              required
              rows={3}
              minLength={20}
              maxLength={2000}
              value={form.why}
              onChange={(e) => set("why", e.target.value)}
              className={FIELD}
            />
          </Field>
        </>
      ) : isEvent ? (
        <>
          <h2 className="pt-2 text-lg font-bold">Your event</h2>
          <Field label="Event name">
            <input
              required
              maxLength={500}
              value={form.eventTitle}
              onChange={(e) => set("eventTitle", e.target.value)}
              className={FIELD}
            />
          </Field>
          <Field label="What is the event about? (optional)">
            <textarea
              rows={4}
              maxLength={2000}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className={FIELD}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-paper/65">
              <span>Starts</span>
              <input required type="datetime-local" value={form.start} onChange={(e) => set("start", e.target.value)} className={FIELD} />
            </label>
            <label className="space-y-1 text-sm text-paper/65">
              <span>Ends</span>
              <input required type="datetime-local" min={form.start} value={form.end} onChange={(e) => set("end", e.target.value)} className={FIELD} />
            </label>
          </div>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="sr-only">Format</legend>
            {(
              [
                { value: "IN_PERSON", title: "In person" },
                { value: "ONLINE", title: "Online" },
              ] as const
            ).map((t) => (
              <label
                key={t.value}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  form.eventType === t.value ? "border-primary bg-primary/10" : "border-white/10 bg-night-2"
                }`}
              >
                <input
                  type="radio"
                  name="eventType"
                  value={t.value}
                  checked={form.eventType === t.value}
                  onChange={() => set("eventType", t.value)}
                  className="sr-only"
                />
                <span className="block font-semibold">{t.title}</span>
              </label>
            ))}
          </fieldset>
          <Field label="City (optional)">
            <input
              maxLength={100}
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              className={FIELD}
            />
          </Field>
          <p className="text-sm text-paper/65">
            Running a club or community?{" "}
            <Link href="/request-space" className="underline hover:text-white">
              Start a Space
            </Link>{" "}
            instead.
          </p>
        </>
      ) : (
        <>
          <h2 className="pt-2 text-lg font-bold">Your space</h2>
          <Field label="Space name">
            <input
              required
              maxLength={255}
              value={form.spaceName}
              onChange={(e) => set("spaceName", e.target.value)}
              className={FIELD}
            />
          </Field>
          <Field label="What is your space about?">
            <textarea
              required
              rows={4}
              maxLength={2000}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className={FIELD}
            />
          </Field>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="sr-only">Space type</legend>
            {TYPES.map((t) => (
              <label
                key={t.value}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  form.type === t.value ? "border-primary bg-primary/10" : "border-white/10 bg-night-2"
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={t.value}
                  checked={form.type === t.value}
                  onChange={() => set("type", t.value)}
                  className="sr-only"
                />
                <span className="block font-semibold">{t.title}</span>
                <span className="block text-sm text-paper/65">{t.body}</span>
              </label>
            ))}
          </fieldset>
          <Field label="City (optional)">
            <input
              maxLength={100}
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              className={FIELD}
            />
          </Field>
          <Field label="Website (optional)">
            <input
              value={form.websiteUrl}
              onChange={(e) => set("websiteUrl", e.target.value)}
              className={FIELD}
            />
          </Field>
          <p className="text-sm text-paper/65">
            Just one event?{" "}
            <Link href="/request-event" className="underline hover:text-white">
              Host it without a Space
            </Link>
            .
          </p>
        </>
      )}

      <h2 className="pt-4 text-lg font-bold">About you</h2>
      <p className="text-sm text-paper/65">
        {isOrbit
          ? "We verify your email and WhatsApp number. If you are already on Unifesto, use the same email."
          : `We create your Unifesto account with these details. You will run the ${isEvent ? "event" : "space"} from it.`}
      </p>
      <Field label="Full name">
        <input
          required
          maxLength={255}
          autoComplete="name"
          value={form.fullName}
          onChange={(e) => set("fullName", e.target.value)}
          className={FIELD}
        />
      </Field>
      {!isEvent && !isOrbit && (
        <Field label="Your role (optional)">
          <input
            maxLength={120}
            value={form.requesterRole}
            onChange={(e) => set("requesterRole", e.target.value)}
            placeholder="e.g. President, Coding Club"
            className={FIELD}
          />
        </Field>
      )}
      <Field label="Email">
        <input
          required
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          className={FIELD}
        />
      </Field>
      <Field label="Mobile number (WhatsApp)">
        <div className="flex items-center rounded-lg bg-night-2 focus-within:border-primary/50">
          <span className="pl-4 text-sm text-paper/65">+91</span>
          <input
            required
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
            className="w-full bg-transparent px-3 py-3 text-sm text-white placeholder:text-paper/55 focus:outline-none"
          />
        </div>
      </Field>
      {isOrbit && (
        <label className="flex cursor-pointer items-start gap-3 text-sm text-paper/75">
          <input
            type="checkbox"
            required
            checked={authorised}
            onChange={(e) => setAuthorised(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
          />
          <span>
            I am 18 or older and currently studying at this campus. I agree to how Unifesto uses my details, as set out
            in the{" "}
            <a href="/privacy#orbit" target="_blank" className="underline hover:text-white">
              Privacy Policy
            </a>
            . If I am appointed, I will accept the{" "}
            <a href="/orbit/terms" target="_blank" className="underline hover:text-white">
              Orbit Lead Programme Terms
            </a>
            .
          </span>
        </label>
      )}
      {!isEvent && !isOrbit && (
        <label className="flex cursor-pointer items-start gap-3 text-sm text-paper/75">
          <input
            type="checkbox"
            required
            checked={authorised}
            onChange={(e) => setAuthorised(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
          />
          <span>
            I am authorised to represent this organisation, and I own or have permission to use any name and logo I add.
            Spaces are marked verified only after we confirm this. See the{" "}
            <a href="/terms#organisers" target="_blank" className="underline hover:text-white">
              Terms
            </a>
            .
          </span>
        </label>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className={CTA}>
        {busy ? "Sending code…" : "Verify and continue"}
      </button>
    </form>
  );
}
