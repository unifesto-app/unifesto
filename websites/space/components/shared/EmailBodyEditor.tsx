"use client";

import { useEffect, useRef, useState } from "react";
import { LinkSimple } from "@unifesto/unicon/react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";

const MERGE_VARS = ["{{firstName}}", "{{name}}", "{{email}}"];

// What the visual editor can show and produce. Anything else means the body
// is hand-written HTML and stays in the HTML tab so nothing gets lost.
const ALLOWED = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "H2", "H3", "UL", "OL", "LI", "A"]);
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE", "FORM", "HEAD", "TITLE", "META", "LINK"]);

const safeHref = (href: string) => /^(https?:|mailto:)/i.test(href.trim());

/** Parse in an inert document (no scripts run, no images load). */
const parse = (html: string) => new DOMParser().parseFromString(html, "text/html").body;

/** True when every tag and attribute fits the visual editor. */
export function isSimpleEmailHtml(html: string): boolean {
  return Array.from(parse(html).querySelectorAll("*")).every(
    (el) =>
      ALLOWED.has(el.tagName) &&
      Array.from(el.attributes).every(
        (a) => el.tagName === "A" && a.name === "href" && safeHref(a.value)
      )
  );
}

/** Reduce HTML to the editor's allowlist: drop dangerous elements, unwrap the rest. */
export function toSimpleEmailHtml(html: string): string {
  const body = parse(html);
  const walk = (node: Element) => {
    for (const el of Array.from(node.children)) {
      walk(el);
      if (DROP.has(el.tagName)) {
        el.remove();
        continue;
      }
      if (el.tagName === "DIV") {
        // Browsers make a <div> per line; keep the line break as a paragraph.
        const p = el.ownerDocument.createElement("p");
        p.append(...Array.from(el.childNodes));
        el.replaceWith(p);
        continue;
      }
      if (!ALLOWED.has(el.tagName)) {
        el.replaceWith(...Array.from(el.childNodes));
        continue;
      }
      for (const a of Array.from(el.attributes)) {
        if (!(el.tagName === "A" && a.name === "href" && safeHref(a.value))) el.removeAttribute(a.name);
      }
    }
  };
  walk(body);
  return body.innerHTML;
}

const TOOLS: { label: string; title: string; run: () => void; className?: string }[] = [
  { label: "B", title: "Bold", run: () => document.execCommand("bold"), className: "font-bold" },
  { label: "I", title: "Italic", run: () => document.execCommand("italic"), className: "italic" },
  { label: "Heading", title: "Heading", run: () => document.execCommand("formatBlock", false, "h2") },
  { label: "Text", title: "Normal text", run: () => document.execCommand("formatBlock", false, "p") },
  { label: "• List", title: "Bulleted list", run: () => document.execCommand("insertUnorderedList") },
  { label: "1. List", title: "Numbered list", run: () => document.execCommand("insertOrderedList") },
];

interface Props {
  id?: string;
  value: string;
  onChange: (html: string) => void;
}

/**
 * Simple email body editor: a formatting toolbar over a contentEditable box,
 * with an HTML tab for hand-written bodies. Emits the same HTML string the
 * campaign API already takes.
 */
// ponytail: document.execCommand is deprecated but works in every browser and
// needs no dependency; swap in TipTap/Lexical if we need tables, images or blocks.
export function EmailBodyEditor({ id, value, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"visual" | "html">(() =>
    typeof window === "undefined" || isSimpleEmailHtml(value) ? "visual" : "html"
  );

  // The last HTML this editor emitted. A `value` that matches it is our own
  // typing coming back, so the box (and the caret) is left alone.
  const lastEmitted = useRef<string | null>(null);

  // A body with custom HTML (a template, say) opens in the HTML tab instead of
  // being stripped. Our own output is always simple, so this only trips on
  // outside changes.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (!isSimpleEmailHtml(value)) setMode("html");
  }

  // Load outside changes (template picked, tab switched) into the box.
  useEffect(() => {
    const el = ref.current;
    if (mode !== "visual" || !el || value === lastEmitted.current) return;
    el.innerHTML = value;
    lastEmitted.current = value;
  }, [value, mode]);

  // Always emit allowlisted HTML (execCommand can leave stray styled spans).
  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const html = el.textContent?.trim() ? toSimpleEmailHtml(el.innerHTML) : "";
    lastEmitted.current = html;
    onChange(html);
  };

  const focusAnd = (fn: () => void) => {
    ref.current?.focus();
    fn();
    emit();
  };

  const addLink = () => {
    const url = window.prompt("Link address (https://…)")?.trim();
    if (!url) return;
    if (!safeHref(url)) {
      window.alert("Links must start with https://, http:// or mailto:");
      return;
    }
    focusAnd(() => document.execCommand("createLink", false, url));
  };

  const insertVar = (token: string) => {
    if (mode === "html") onChange(`${value}${token}`);
    else focusAnd(() => document.execCommand("insertText", false, token));
  };

  const toVisual = () => {
    if (
      !isSimpleEmailHtml(value) &&
      !window.confirm(
        "This email uses HTML the simple editor can't show (styles, tables or images). Switch anyway and drop that formatting?"
      )
    )
      return;
    const simple = toSimpleEmailHtml(value);
    if (simple !== value) onChange(simple);
    lastEmitted.current = null; // the box remounts empty, so always load it
    setMode("visual");
  };

  const tab = (active: boolean) =>
    cn(
      "rounded px-2.5 py-1 text-xs font-medium transition-colors",
      active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === "visual" ? (
          <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1">
            {TOOLS.map((t) => (
              <button
                key={t.title}
                type="button"
                title={t.title}
                aria-label={t.title}
                // Keep the selection in the editor when the button is pressed.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => focusAnd(t.run)}
                className={cn(
                  "h-8 min-w-8 rounded-md border border-border bg-card px-2 text-xs text-foreground transition-colors hover:bg-muted",
                  t.className
                )}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              title="Link"
              aria-label="Link"
              onMouseDown={(e) => e.preventDefault()}
              onClick={addLink}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted"
            >
              <LinkSimple className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Editing raw HTML</span>
        )}
        <div className="flex rounded-md bg-muted p-0.5">
          <button type="button" className={tab(mode === "visual")} onClick={toVisual}>
            Editor
          </button>
          <button type="button" className={tab(mode === "html")} onClick={() => setMode("html")}>
            HTML
          </button>
        </div>
      </div>

      {mode === "visual" ? (
        <div
          id={id}
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label="Email body"
          contentEditable
          suppressContentEditableWarning
          onFocus={() => document.execCommand("defaultParagraphSeparator", false, "p")}
          onInput={emit}
          onBlur={emit}
          // Paste as plain text so Docs/Word styling never reaches the email.
          onPaste={(e) => {
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
          data-placeholder="Hi {{firstName}}, …"
          className={cn(
            "min-h-[280px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
            "[&_a]:text-primary [&_a]:underline [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
          )}
        />
      ) : (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={14}
          placeholder="<p>Hi {{firstName}}, …</p>"
          className="font-mono text-xs"
        />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Insert:</span>
        {MERGE_VARS.map((v) => (
          <button
            key={v}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertVar(v)}
            className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs text-foreground transition-colors hover:border-border-strong hover:bg-secondary"
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
