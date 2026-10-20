"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const FIELD =
  "w-full rounded-3xl bg-night-2 px-4 py-3 text-sm text-white placeholder:text-paper/55 focus:border-primary/50 focus:outline-none";
const CTA = "btn btn-primary";

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
 * Space requests belong to an account (approval makes the requester the Space
 * Admin), so we run the app's signup inline: email OTP, then WhatsApp OTP on
 * the phone (verify-mobile creates the account), then save their name and
 * submit with that token. An email that already has a verified account gets
 * its token straight from the email step, so the phone step is skipped.
 *
 * `kind="event"` asks to host one event without a space instead (Assist D7):
 * same signup, event basics in place of the space, followed in My help.
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
        <h2 className="text-2xl font-bold">Request sent</h2>
        <p className="mt-2 text-paper/65">
          We will review <strong className="text-white">{isEvent ? form.eventTitle : form.spaceName}</strong>. Sign in to
          the Unifesto app with {email} to {isEvent ? "follow it in My help" : "track your request"}.
        </p>
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
        <button type="submit" disabled={busy} className={CTA}>
          {busy ? "Verifying…" : isEmail ? "Verify email" : "Verify phone and send request"}
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
          <select
            required
            aria-label="Campus"
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
          {form.campusId === "other" && (
            <input
              required
              maxLength={200}
              aria-label="College name"
              value={form.collegeName}
              onChange={(e) => set("collegeName", e.target.value)}
              placeholder="Full name of your college, and its city"
              className={FIELD}
            />
          )}
          <select
            required
            aria-label="Year of study"
            value={form.yearOfStudy}
            onChange={(e) => set("yearOfStudy", e.target.value)}
            className={FIELD}
          >
            <option value="">Year of study</option>
            {["1st year", "2nd year", "3rd year", "4th year", "5th year", "Postgraduate"].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <textarea
            required
            rows={2}
            minLength={2}
            maxLength={1000}
            aria-label="Clubs or fest teams you are part of"
            value={form.myClubs}
            onChange={(e) => set("myClubs", e.target.value)}
            placeholder="Clubs or fest teams you are part of, and your role"
            className={FIELD}
          />
          <textarea
            required
            rows={6}
            minLength={20}
            maxLength={4000}
            aria-label="Active clubs on your campus"
            value={form.campusClubs}
            onChange={(e) => set("campusClubs", e.target.value)}
            placeholder={"Active clubs on your campus, one per line, with their next event if you know it. Aim for 15.\nCoding Club: hackathon in January\nDance Club: annual showcase"}
            className={FIELD}
          />
          <textarea
            required
            rows={3}
            minLength={20}
            maxLength={2000}
            aria-label="Why you want to be an Orbit Lead"
            value={form.why}
            onChange={(e) => set("why", e.target.value)}
            placeholder="Why you want to be your campus's Orbit Lead"
            className={FIELD}
          />
        </>
      ) : isEvent ? (
        <>
          <h2 className="pt-2 text-lg font-bold">Your event</h2>
          <input
            required
            maxLength={500}
            aria-label="Event name"
            value={form.eventTitle}
            onChange={(e) => set("eventTitle", e.target.value)}
            placeholder="Event name"
            className={FIELD}
          />
          <textarea
            rows={4}
            maxLength={2000}
            aria-label="What is the event about?"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What is the event about? (optional)"
            className={FIELD}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-paper/65">
              <span>Starts</span>
              <input required type="datetime-local" value={form.start} onChange={(e) => set("start", e.target.value)} className={FIELD} />
            </label>
            <label className="space-y-1 text-sm text-paper/65">
              <span>Ends</span>
              <input required type="datetime-local" min={form.start} value={form.end} onChange={(e) => set("end", e.target.value)} className={FIELD} />
            </label>
          </div>
          <fieldset className="grid gap-3 sm:grid-cols-2">
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
          <input
            maxLength={100}
            aria-label="City"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder="City (optional)"
            className={FIELD}
          />
          <p className="text-sm text-paper/65">
            Running a club or community?{" "}
            <Link href="/request-space" className="underline hover:text-white">
              Request a Space
            </Link>{" "}
            instead.
          </p>
        </>
      ) : (
        <>
          <h2 className="pt-2 text-lg font-bold">Your space</h2>
          <input
            required
            maxLength={255}
            aria-label="Space name"
            value={form.spaceName}
            onChange={(e) => set("spaceName", e.target.value)}
            placeholder="Space name"
            className={FIELD}
          />
          <textarea
            required
            rows={4}
            maxLength={2000}
            aria-label="What is your space about?"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What is your space about?"
            className={FIELD}
          />
          <fieldset className="grid gap-3 sm:grid-cols-2">
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
          <input
            maxLength={100}
            aria-label="City"
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder="City (optional)"
            className={FIELD}
          />
          <input
            aria-label="Website"
            value={form.websiteUrl}
            onChange={(e) => set("websiteUrl", e.target.value)}
            placeholder="Website (optional)"
            className={FIELD}
          />
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
      <input
        required
        maxLength={255}
        autoComplete="name"
        aria-label="Full name"
        value={form.fullName}
        onChange={(e) => set("fullName", e.target.value)}
        placeholder="Full name"
        className={FIELD}
      />
      {!isEvent && !isOrbit && (
        <input
          maxLength={120}
          aria-label="Your role"
          value={form.requesterRole}
          onChange={(e) => set("requesterRole", e.target.value)}
          placeholder="Your role, e.g. President, Coding Club (optional)"
          className={FIELD}
        />
      )}
      <input
        required
        type="email"
        autoComplete="email"
        aria-label="Email"
        value={form.email}
        onChange={(e) => set("email", e.target.value)}
        placeholder="Email"
        className={FIELD}
      />
      <div className="flex items-center rounded-3xl bg-night-2 focus-within:border-primary/50">
        <span className="pl-4 text-sm text-paper/65">+91</span>
        <input
          required
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          aria-label="Mobile number"
          value={form.phone}
          onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="Mobile number (WhatsApp)"
          className="w-full bg-transparent px-3 py-3 text-sm text-white placeholder:text-paper/55 focus:outline-none"
        />
      </div>
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
