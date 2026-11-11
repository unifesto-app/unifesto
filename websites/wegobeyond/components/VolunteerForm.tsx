"use client";

import { useState } from "react";
import { UNIFESTO } from "@/lib/site";
import { parseOption, validateSubmission, type Answer, type CrewFormDef, type FieldType, type FormField, type Values } from "@/lib/crewForm";

// Drawn entirely from the form definition (edited in Unifesto Apex): which questions, in
// what order, how wide, and how choices look. Sign-ups go straight to the Unifesto API,
// which checks them against the same definition and stores them for Apex.

// A six-track grid: full = 6, half = 3, third = 3 on tablets and 2 on desktops.
const SPAN = { full: "sm:col-span-6", half: "sm:col-span-3", third: "sm:col-span-3 lg:col-span-2" } as const;

const INPUT_TYPE: Partial<Record<FieldType, string>> = { short: "text", email: "email", phone: "tel", url: "url", number: "text", date: "date" };

// Browser autofill for the always-present contact fields.
const AUTOCOMPLETE: Record<string, string> = { name: "name", email: "email", phone: "tel", city: "address-level2" };

const blank = (form: CrewFormDef): Values =>
  Object.fromEntries(form.fields.filter((f) => f.type !== "heading").map((f) => [f.id, f.type === "multi" ? [] : ""]));

export default function VolunteerForm({ form }: { form: CrewFormDef }) {
  const [values, setValues] = useState<Values>(() => blank(form));
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [serverError, setServerError] = useState("");

  const set = (id: string, v: Answer) => setValues((prev) => ({ ...prev, [id]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");
    const next = validateSubmission(form, values).errors;
    if (!consent) next.consent = "Please agree to be contacted.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setStatus("submitting");
    try {
      const res = await fetch(`${UNIFESTO.api}/wegobeyond/crew-signups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, consent, company_website: honeypot }),
      });
      // 200 { ok: true }; 422 { message: { [questionId]: error } }; 429 when someone retries too fast.
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: unknown };

      if (res.ok && data.ok) {
        setStatus("success");
        return;
      }

      const fieldErrors = res.status === 422 && data.message && typeof data.message === "object" ? (data.message as Record<string, string>) : null;
      if (fieldErrors) setErrors(fieldErrors);
      setServerError(
        fieldErrors
          ? "Check the answers marked above."
          : res.status === 429
            ? "That’s a few tries in a row. Wait a few minutes, then send it again."
            : "We couldn’t save your sign-up. Please try again."
      );
      setStatus("error");
    } catch {
      setServerError("Couldn’t reach the server. Check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div role="status" className="py-6 text-center">
        <h3 className="text-rust">{form.successTitle}</h3>
        <p className="mx-auto mt-4 max-w-md text-silver">{form.successBody}</p>
        <button
          type="button"
          onClick={() => {
            setValues(blank(form));
            setConsent(false);
            setStatus("idle");
          }}
          className="btn btn-ghost mt-8"
        >
          Submit another response
        </button>
      </div>
    );
  }

  const busy = status === "submitting";

  return (
    <form noValidate onSubmit={handleSubmit} className="grid gap-x-6 gap-y-8 sm:grid-cols-6">
      {/* Honeypot: visually hidden, off the tab order. Bots fill it; humans don't. */}
      <div aria-hidden="true" className="absolute h-px w-px overflow-hidden opacity-0">
        <label htmlFor="company_website">Company website</label>
        <input
          id="company_website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {form.fields.map((f) => (
        <div key={f.id} className={`@container ${f.type === "heading" ? SPAN.full : SPAN[f.width]}`}>
          <Question field={f} value={values[f.id]} error={errors[f.id]} onChange={(v) => set(f.id, v)} />
        </div>
      ))}

      <div className={SPAN.full}>
        <label className="flex items-start gap-3 text-silver">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-invalid={!!errors.consent}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-rust)]"
          />
          <span>{form.consent}</span>
        </label>
        {errors.consent && <p className="mt-2 text-rust">{errors.consent}</p>}
      </div>

      <div className={`${SPAN.full} flex flex-wrap items-center gap-4`}>
        <button type="submit" className="btn btn-paper" disabled={busy}>
          {busy ? "Sending…" : form.submitLabel}
        </button>
        {status === "error" && serverError && (
          <p className="text-rust" role="alert">
            {serverError}
          </p>
        )}
      </div>
    </form>
  );
}

// One question, drawn by its type and display.
function Question({
  field: f,
  value,
  error,
  onChange,
}: {
  field: FormField;
  value: Answer | undefined;
  error?: string;
  onChange: (v: Answer) => void;
}) {
  if (f.type === "heading") {
    return (
      <div className="pt-4">
        <h3>{f.label}</h3>
        {f.help && <p className="mt-2 max-w-[60ch] text-silver">{f.help}</p>}
      </div>
    );
  }

  const describedBy = [f.help && `${f.id}-help`, error && `${f.id}-error`].filter(Boolean).join(" ") || undefined;
  const title = (
    <>
      {f.label} {!f.required && <span className="font-normal text-silver">(optional)</span>}
    </>
  );
  const help = f.help && (
    <span id={`${f.id}-help`} className="caption mt-1 block text-silver">
      {f.help}
    </span>
  );
  const errorLine = error && (
    <p id={`${f.id}-error`} className="mt-2 text-rust">
      {error}
    </p>
  );

  // A group of options (radios or checkboxes) unless it's a one-choice dropdown.
  if (f.type === "multi" || f.type === "yesno" || (f.type === "choice" && f.display !== "dropdown")) {
    const multi = f.type === "multi";
    const options = f.type === "yesno" ? [{ label: "Yes", hint: "" }, { label: "No", hint: "" }] : f.options.map(parseOption);
    // A dropdown can't pick several, so multi falls back to pills; yes/no is always pills.
    const display = f.type === "yesno" || (multi && f.display === "dropdown") ? "pills" : f.display;
    const list = Array.isArray(value) ? value : [];
    const picked = (o: string) => (multi ? list.includes(o) : value === o);
    const pick = (o: string) => onChange(multi ? (picked(o) ? list.filter((x) => x !== o) : [...list, o]) : o);

    const input = (o: string, className: string) => (
      <input
        type={multi ? "checkbox" : "radio"}
        name={f.id}
        value={o}
        checked={picked(o)}
        onChange={() => pick(o)}
        className={className}
      />
    );

    return (
      <fieldset aria-describedby={describedBy} aria-invalid={!!error}>
        <legend className="small">{title}</legend>
        {help}

        {display === "pills" && (
          <div className="mt-3 flex flex-wrap gap-2.5">
            {options.map((o) => (
              <label
                key={o.label}
                className={`small cursor-pointer rounded-full px-5 py-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-rust ${
                  picked(o.label) ? "bg-paper text-ink" : "bg-ink text-paper ring-[1.5px] ring-line ring-inset hover:ring-silver/60"
                }`}
              >
                {input(o.label, "sr-only")}
                {o.label}
              </label>
            ))}
          </div>
        )}

        {display === "tiles" && (
          <div className="mt-3 grid gap-2.5 @md:grid-cols-2 @4xl:grid-cols-4">
            {options.map((o) => (
              <label
                key={o.label}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border-[1.5px] bg-ink px-4 py-3.5 transition-colors ${
                  picked(o.label) ? "border-rust" : "border-line hover:border-silver/60"
                }`}
              >
                {input(o.label, "mt-1 h-4 w-4 shrink-0 accent-[var(--color-rust)]")}
                <span>
                  <span className="small block">{o.label}</span>
                  {o.hint && <span className="caption mt-0.5 block text-silver">{o.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        )}

        {display === "list" && (
          <div className="mt-3 space-y-3">
            {options.map((o) => (
              <label key={o.label} className="flex cursor-pointer items-start gap-3">
                {input(o.label, "mt-1 h-4 w-4 shrink-0 accent-[var(--color-rust)]")}
                <span>
                  {o.label}
                  {o.hint && <span className="caption block text-silver">{o.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        )}

        {errorLine}
      </fieldset>
    );
  }

  const common = {
    id: f.id,
    name: f.id,
    className: "field mt-2",
    value: typeof value === "string" ? value : "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(e.target.value),
    "aria-required": f.required,
    "aria-invalid": !!error,
    "aria-describedby": describedBy,
  };

  return (
    <div>
      <label htmlFor={f.id} className="small block">
        {title}
      </label>
      {help}
      {f.type === "long" ? (
        <textarea {...common} rows={4} maxLength={2000} placeholder={f.placeholder} className="field mt-2 resize-y" />
      ) : f.type === "choice" ? (
        <select {...common}>
          <option value="">{f.placeholder || "Select…"}</option>
          {f.options.map((line) => {
            const { label } = parseOption(line);
            return (
              <option key={label} value={label}>
                {label}
              </option>
            );
          })}
        </select>
      ) : (
        <input
          {...common}
          type={INPUT_TYPE[f.type] ?? "text"}
          inputMode={f.type === "number" ? "decimal" : undefined}
          autoComplete={AUTOCOMPLETE[f.id]}
          placeholder={f.placeholder}
        />
      )}
      {errorLine}
    </div>
  );
}
