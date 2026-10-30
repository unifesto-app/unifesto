"use client";

import { INDIAN_STATES, type FormField } from "@/lib/api/registration";

/* Registration questions, shared by registering and by editing my answers afterwards. */

export const FIELD =
  "w-full rounded-lg bg-canvas px-4 py-3 text-sm text-paper placeholder:text-paper/55 focus:outline-none focus:ring-1 focus:ring-primary/50";
export const CHOICE = "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors";

/** One registration question. Answers use the shapes the backend's checkAnswers accepts. */
export function Question({ field: f, value, onChange }: { field: FormField; value: unknown; onChange: (v: unknown) => void }) {
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
