"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { parseOption, type CrewForm, type FormQuestion } from "@/lib/api/wegobeyond-api";

/*
 * The crew form as wegobeyond.in draws it (components/VolunteerForm.tsx there),
 * in the site's own look rather than Apex's: ink ground, paper type, rust accent,
 * DM Sans. Container queries stand in for the site's sm/lg breakpoints so the
 * layout follows the preview's width, not the window's. Clickable, saves nothing.
 */

const SPAN = { full: "@lg:col-span-6", half: "@lg:col-span-3", third: "@lg:col-span-3 @3xl:col-span-2" } as const;
const INPUT_TYPE: Partial<Record<FormQuestion["type"], string>> = { email: "email", phone: "tel", url: "url", date: "date" };

const field =
  "mt-2 w-full rounded-[14px] border-[1.5px] border-[#2e2b28] bg-[#0e0c0b] px-4 py-[0.85rem] text-[16px] text-[#e9e5dc] placeholder:text-[#a7a6a0]/70 focus:border-[#cc5a2f] focus:outline-none";
const small = "text-[15px] font-bold leading-[1.2] tracking-[-0.01em]";
const caption = "text-[15px] leading-[1.4] text-[#a7a6a0]";

export function CrewFormPreview({ form }: { form: CrewForm }) {
  const [view, setView] = useState<"form" | "sent">("form");
  const [values, setValues] = useState<Record<string, string | string[]>>({});

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">Preview</p>
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
          {(["form", "sent"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {v === "form" ? "Form" : "After sending"}
            </button>
          ))}
        </div>
      </div>

      <div
        className="@container rounded-2xl bg-[#0e0c0b] p-5 text-[17px] leading-[1.45] text-[#e9e5dc] antialiased"
        style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }}
      >
        <p className="max-w-[44ch] text-[18px] text-[#a7a6a0]">{form.intro}</p>
        <div className="mt-6 rounded-[28px] bg-[#1a1817] p-6">
          {view === "sent" ? (
            <div className="py-6 text-center">
              <h3 className="text-[28px] font-bold leading-none tracking-[-0.035em] text-[#cc5a2f]">{form.successTitle}</h3>
              <p className="mx-auto mt-4 max-w-md text-[#a7a6a0]">{form.successBody}</p>
            </div>
          ) : (
            <div className="grid gap-x-6 gap-y-8 @lg:grid-cols-6">
              {form.fields.map((f, i) => (
                <div key={`${f.id}-${i}`} className={cn("@container min-w-0", f.type === "heading" ? SPAN.full : SPAN[f.width])}>
                  <Question q={f} value={values[f.id]} onChange={(v) => setValues((p) => ({ ...p, [f.id]: v }))} />
                </div>
              ))}
              <label className={cn("flex items-start gap-3 text-[#a7a6a0]", SPAN.full)}>
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#cc5a2f]" />
                <span>{form.consent}</span>
              </label>
              <div className={SPAN.full}>
                <button type="button" className="rounded-full bg-[#e9e5dc] px-6 py-[17px] text-[15px] font-bold leading-none tracking-[-0.01em] text-[#0e0c0b]">
                  {form.submitLabel}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Question({ q, value, onChange }: { q: FormQuestion; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  if (q.type === "heading") {
    return (
      <div className="pt-4">
        <h3 className="text-[28px] font-bold leading-none tracking-[-0.035em]">{q.label || "Section heading"}</h3>
        {q.help && <p className="mt-2 max-w-[60ch] text-[#a7a6a0]">{q.help}</p>}
      </div>
    );
  }

  const title = (
    <>
      {q.label || "Untitled question"} {!q.required && <span className="font-normal text-[#a7a6a0]">(optional)</span>}
    </>
  );
  const help = q.help && <span className={cn(caption, "mt-1 block")}>{q.help}</span>;

  if (q.type === "multi" || q.type === "yesno" || (q.type === "choice" && q.display !== "dropdown")) {
    const multi = q.type === "multi";
    // Blank lines (mid-typing) are dropped on save, so they're skipped here too.
    const options =
      q.type === "yesno" ? [{ label: "Yes", hint: "" }, { label: "No", hint: "" }] : q.options.map(parseOption).filter((o) => o.label);
    // Same fallbacks as the site: a dropdown can't pick several; yes/no is always pills.
    const display = q.type === "yesno" || (multi && q.display === "dropdown") ? "pills" : q.display;
    const list = Array.isArray(value) ? value : [];
    const picked = (o: string) => (multi ? list.includes(o) : value === o);
    const pick = (o: string) => onChange(multi ? (picked(o) ? list.filter((x) => x !== o) : [...list, o]) : o);
    const box = (o: string, className: string) => (
      <input type={multi ? "checkbox" : "radio"} checked={picked(o)} onChange={() => pick(o)} className={className} />
    );

    return (
      <fieldset>
        <legend className={small}>{title}</legend>
        {help}
        {display === "pills" && (
          <div className="mt-3 flex flex-wrap gap-2.5">
            {options.map((o, n) => (
              <label
                key={`${o.label}-${n}`}
                className={cn(
                  small,
                  "cursor-pointer rounded-full px-5 py-3 transition-colors",
                  picked(o.label) ? "bg-[#e9e5dc] text-[#0e0c0b]" : "bg-[#0e0c0b] text-[#e9e5dc] ring-[1.5px] ring-inset ring-[#2e2b28] hover:ring-[#a7a6a0]/60"
                )}
              >
                {box(o.label, "sr-only")}
                {o.label}
              </label>
            ))}
          </div>
        )}
        {display === "tiles" && (
          <div className="mt-3 grid gap-2.5 @md:grid-cols-2 @4xl:grid-cols-4">
            {options.map((o, n) => (
              <label
                key={`${o.label}-${n}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-2xl border-[1.5px] bg-[#0e0c0b] px-4 py-3.5 transition-colors",
                  picked(o.label) ? "border-[#cc5a2f]" : "border-[#2e2b28] hover:border-[#a7a6a0]/60"
                )}
              >
                {box(o.label, "mt-1 h-4 w-4 shrink-0 accent-[#cc5a2f]")}
                <span>
                  <span className={cn(small, "block")}>{o.label}</span>
                  {o.hint && <span className={cn(caption, "mt-0.5 block")}>{o.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
        {display === "list" && (
          <div className="mt-3 space-y-3">
            {options.map((o, n) => (
              <label key={`${o.label}-${n}`} className="flex cursor-pointer items-start gap-3">
                {box(o.label, "mt-1 h-4 w-4 shrink-0 accent-[#cc5a2f]")}
                <span>
                  {o.label}
                  {o.hint && <span className={cn(caption, "block")}>{o.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
    );
  }

  const text = typeof value === "string" ? value : "";
  return (
    <div>
      <label className={cn(small, "block")}>{title}</label>
      {help}
      {q.type === "long" ? (
        <textarea rows={4} placeholder={q.placeholder} value={text} onChange={(e) => onChange(e.target.value)} className={cn(field, "resize-y")} />
      ) : q.type === "choice" ? (
        <select value={text} onChange={(e) => onChange(e.target.value)} className={field}>
          <option value="">{q.placeholder || "Select…"}</option>
          {q.options.map((line) => {
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
          type={INPUT_TYPE[q.type] ?? "text"}
          placeholder={q.placeholder}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          className={field}
        />
      )}
    </div>
  );
}
