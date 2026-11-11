"use client";

import { useState } from "react";

type Errors = { name?: string; email?: string; message?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// There is no backend for general enquiries, so this composes an email in the
// visitor's mail client (mailto). Nothing pretends to be saved server-side.
export default function ContactForm({ inbox }: { inbox: string }) {
  const [values, setValues] = useState({ name: "", email: "", message: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState(false);

  function validate(v: typeof values): Errors {
    const e: Errors = {};
    if (!v.name.trim()) e.name = "Please add your name.";
    if (!v.email.trim()) e.email = "Please add an email.";
    else if (!EMAIL_RE.test(v.email)) e.email = "That email doesn’t look right.";
    if (!v.message.trim()) e.message = "Add a short message.";
    return e;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const subject = `Website enquiry from ${values.name}`;
    const body = `${values.message}\n\nFrom ${values.name} (${values.email})`;
    window.location.href = `mailto:${inbox}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    setSent(true);
  }

  const fields = [
    { id: "name", label: "Name", type: "text", autoComplete: "name" },
    { id: "email", label: "Email", type: "email", autoComplete: "email" },
  ] as const;

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-6">
      {fields.map((f) => (
        <div key={f.id}>
          <label htmlFor={f.id} className="small block">
            {f.label}
          </label>
          <input
            id={f.id}
            name={f.id}
            type={f.type}
            autoComplete={f.autoComplete}
            className="field mt-2"
            value={values[f.id]}
            onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
            aria-invalid={!!errors[f.id]}
            aria-describedby={errors[f.id] ? `${f.id}-error` : undefined}
          />
          {errors[f.id] && (
            <p id={`${f.id}-error`} className="mt-2 text-rust">
              {errors[f.id]}
            </p>
          )}
        </div>
      ))}

      <div>
        <label htmlFor="message" className="small block">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          className="field mt-2 resize-y"
          value={values.message}
          onChange={(e) => setValues({ ...values, message: e.target.value })}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? "message-error" : undefined}
        />
        {errors.message && (
          <p id="message-error" className="mt-2 text-rust">
            {errors.message}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-paper">
          Send message
        </button>
        {sent && (
          <p className="text-silver" role="status">
            Opening your mail app. If nothing happened, write to {inbox}.
          </p>
        )}
      </div>
    </form>
  );
}
