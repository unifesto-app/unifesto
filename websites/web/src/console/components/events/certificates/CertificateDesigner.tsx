"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { Plus, Trash, FloppyDisk, Spinner, TextT } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/console/components/ui/select";
import {
  CertificateField,
  CertificateFieldKey,
  CertificateTemplate,
  CERTIFICATE_FONTS,
  CERTIFICATE_FONTS_STYLESHEET,
  createTemplate,
  updateTemplate,
  uploadCertificateBackground,
} from "@/console/lib/api/certificates-api";

const DEFAULT_FONT = "Helvetica";

interface CertificateDesignerProps {
  eventId: string;
  /** Editing an existing template, or undefined to design a new one. */
  template?: CertificateTemplate;
  onSaved: (template: CertificateTemplate) => void;
  onCancel: () => void;
}

/** Placeholder text shown in the editor for each dynamic key. */
const SAMPLE: Record<CertificateFieldKey, string> = {
  recipientName: "Recipient Name",
  eventTitle: "Event Title",
  issueDate: "1 January 2026",
  certificateNumber: "UF-EVENT-0001",
  custom: "Custom text",
  verifyQr: "",
};

const FIELD_LABELS: Record<CertificateFieldKey, string> = {
  recipientName: "Recipient name",
  eventTitle: "Event title",
  issueDate: "Issue date",
  certificateNumber: "Certificate number",
  custom: "Custom text",
  verifyQr: "Verify QR code",
};

/** The content keys a text field can hold (everything except the QR element). */
const TEXT_FIELD_KEYS = (
  Object.keys(FIELD_LABELS) as CertificateFieldKey[]
).filter((k) => k !== "verifyQr");

/** A default verify-QR element, bottom-left, seeded into new templates. */
function defaultQrField(canvasWidth: number, canvasHeight: number): CertificateField {
  const size = Math.round(canvasWidth * 0.12);
  return {
    key: "verifyQr",
    x: Math.round(canvasWidth * 0.08),
    y: Math.round(canvasHeight - size - canvasHeight * 0.14),
    fontSize: 20,
    maxWidth: size,
  };
}

/**
 * Sample values used to preview `{placeholder}` substitution in custom text,
 * mirroring the backend's `interpolate()` so the editor is true-to-render.
 */
const PLACEHOLDER_SAMPLE: Record<string, string> = {
  recipientName: "Recipient Name",
  eventTitle: "Event Title",
  issueDate: "1 January 2026",
  certificateNumber: "UF-EVENT-0001",
  spaceName: "Unifesto",
};

/** The placeholders an organiser may drop into custom text. */
const CUSTOM_PLACEHOLDERS = Object.keys(PLACEHOLDER_SAMPLE);

/** Replace `{key}` tokens with sample values, leaving unknown tokens as-is. */
function interpolatePreview(text: string): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in PLACEHOLDER_SAMPLE ? PLACEHOLDER_SAMPLE[k] : m
  );
}

/**
 * The starter fields seeded into a brand-new template: the recipient's name, a
 * footer that fills in the issue date, and the verify QR. The organiser edits
 * or removes any of them.
 */
function defaultFields(w: number, h: number): CertificateField[] {
  return [
    {
      key: "recipientName",
      x: Math.round(w * 0.1),
      y: Math.round(h * 0.42),
      fontSize: Math.round(h * 0.06),
      color: "#111111",
      align: "center",
      bold: true,
      maxWidth: Math.round(w * 0.8),
    },
    {
      key: "custom",
      label: "Issued by Unifesto on {issueDate}",
      x: Math.round(w * 0.1),
      y: Math.round(h * 0.82),
      fontSize: Math.round(h * 0.028),
      color: "#555555",
      align: "center",
      maxWidth: Math.round(w * 0.8),
    },
    defaultQrField(w, h),
  ];
}

/**
 * A QR-like module grid used only as a preview placeholder — it is NOT a real
 * scannable code, but shows the organiser where the actual verify QR (generated
 * at issue time) will sit, at the true size and position.
 */
function QrPreviewMatrix() {
  const N = 21;
  const cells: ReactElement[] = [];
  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
  const finderOn = (r: number, c: number) => {
    const br = r < 7 ? 0 : N - 7;
    const bc = c < 7 ? 0 : N - 7;
    const lr = r - br;
    const lc = c - bc;
    const ring = lr === 0 || lr === 6 || lc === 0 || lc === 6;
    const core = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
    return ring || core;
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const on = inFinder(r, c)
        ? finderOn(r, c)
        : (r * 7 + c * 13 + r * c) % 3 === 0;
      if (on) {
        cells.push(<rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} />);
      }
    }
  }
  return (
    <svg
      viewBox={`0 0 ${N} ${N}`}
      width="100%"
      height="100%"
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={N} height={N} fill="#ffffff" />
      <g fill="#000000">{cells}</g>
    </svg>
  );
}

export function CertificateDesigner({
  eventId,
  template,
  onSaved,
  onCancel,
}: CertificateDesignerProps) {
  const [name, setName] = useState(template?.name ?? "");
  const [backgroundUrl, setBackgroundUrl] = useState(
    template?.backgroundUrl ?? ""
  );
  const [canvasWidth, setCanvasWidth] = useState(template?.canvasWidth ?? 0);
  const [canvasHeight, setCanvasHeight] = useState(template?.canvasHeight ?? 0);
  const [fields, setFields] = useState<CertificateField[]>(
    template?.fields ?? []
  );
  const [selected, setSelected] = useState<number | null>(null);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [displayWidth, setDisplayWidth] = useState(0);

  // Load the certificate fonts once so the preview is true-to-render (WYSIWYG).
  useEffect(() => {
    const id = "certificate-fonts-stylesheet";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = CERTIFICATE_FONTS_STYLESHEET;
    document.head.appendChild(link);
  }, []);

  // Track the rendered canvas width so on-screen font sizes scale with it.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setDisplayWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [backgroundUrl]);

  const scale = canvasWidth > 0 ? displayWidth / canvasWidth : 1;

  // Nudge the selected field with the arrow keys (Shift = 10px steps). Ignored
  // while typing in an input so number/text fields keep their own arrow behaviour.
  useEffect(() => {
    if (selected === null) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const delta: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      const d = delta[e.key];
      if (!d) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      setFields((f) =>
        f.map((field, i) =>
          i === selected
            ? {
                ...field,
                x: Math.max(0, Math.min(canvasWidth, field.x + d[0] * step)),
                y: Math.max(0, Math.min(canvasHeight, field.y + d[1] * step)),
              }
            : field
        )
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, canvasWidth, canvasHeight]);

  // --------------------------------------------------------------------------
  // Background upload — read the natural size so the canvas matches the design.
  // --------------------------------------------------------------------------

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError(null);

    // Natural dimensions become the canvas the fields are authored against.
    const dims = await readImageSize(file).catch(() => null);
    if (!dims) {
      setError("Could not read that image.");
      return;
    }

    setUploading(true);
    const { data, error: upErr } = await uploadCertificateBackground(
      eventId,
      file
    );
    setUploading(false);

    if (upErr || !data) {
      setError(upErr?.message ?? "Upload failed");
      return;
    }
    setBackgroundUrl(data.url);
    setCanvasWidth(dims.width);
    setCanvasHeight(dims.height);

    // A brand-new template (no fields yet) gets the full starter set — name,
    // issued-on footer, and verify QR. When replacing the background of an
    // existing design we keep every field, only ensuring a verify QR is present.
    setFields((f) =>
      f.length === 0
        ? defaultFields(dims.width, dims.height)
        : f.some((x) => x.key === "verifyQr")
          ? f
          : [...f, defaultQrField(dims.width, dims.height)]
    );
  };

  // --------------------------------------------------------------------------
  // Field editing
  // --------------------------------------------------------------------------

  const addField = () => {
    if (!canvasWidth) return;
    const field: CertificateField = {
      key: "recipientName",
      x: Math.round(canvasWidth * 0.1),
      y: Math.round(canvasHeight * 0.45),
      fontSize: Math.round(canvasHeight * 0.05),
      color: "#111111",
      align: "center",
      bold: true,
      maxWidth: Math.round(canvasWidth * 0.8),
    };
    setFields((f) => [...f, field]);
    setSelected(fields.length);
  };

  const patchField = (index: number, patch: Partial<CertificateField>) => {
    setFields((f) =>
      f.map((field, i) => (i === index ? { ...field, ...patch } : field))
    );
  };

  const removeField = (index: number) => {
    setFields((f) => f.filter((_, i) => i !== index));
    setSelected(null);
  };

  // Drag a field's box. Coordinates are converted back to canvas space using
  // the live element size, so the mapping is exact at any zoom / screen width.
  const startDrag = (index: number, e: React.PointerEvent) => {
    e.preventDefault();
    setSelected(index);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = rect.width / canvasWidth;
    const field = fields[index];
    const grabX = e.clientX - rect.left - field.x * s;
    const grabY = e.clientY - rect.top - field.y * s;

    const onMove = (ev: PointerEvent) => {
      const nx = (ev.clientX - rect.left - grabX) / s;
      const ny = (ev.clientY - rect.top - grabY) / s;
      patchField(index, {
        x: Math.max(0, Math.min(canvasWidth, Math.round(nx))),
        y: Math.max(0, Math.min(canvasHeight, Math.round(ny))),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // --------------------------------------------------------------------------
  // Save
  // --------------------------------------------------------------------------

  const handleSave = async () => {
    if (!name.trim()) return setError("Give the template a name.");
    if (!backgroundUrl) return setError("Upload a background image.");
    if (fields.length === 0) return setError("Add at least one field.");
    for (const f of fields) {
      if (f.key === "custom" && !f.label?.trim()) {
        return setError("Custom fields need their text filled in.");
      }
    }
    setError(null);
    setSaving(true);

    const payload = { name: name.trim(), backgroundUrl, canvasWidth, canvasHeight, fields };
    const { data, error: saveErr } = template
      ? await updateTemplate(template.id, payload)
      : await createTemplate(eventId, payload);

    setSaving(false);
    if (saveErr || !data) {
      setError(saveErr?.message ?? "Failed to save template");
      return;
    }
    onSaved(data);
  };

  const selectedField = selected !== null ? fields[selected] : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      {/* Canvas ----------------------------------------------------------- */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="tpl-name">Template name</Label>
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Participation Certificate"
          />
        </div>

        {!backgroundUrl ? (
          <label className="flex aspect-[1.414/1] w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground hover:bg-muted/50">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
              disabled={uploading}
            />
            {uploading ? (
              <Spinner className="h-8 w-8 animate-spin" />
            ) : (
              <>
                <TextT className="h-8 w-8" weight="duotone" />
                <span className="text-sm">
                  Upload your certificate background
                </span>
                <span className="text-xs">
                  A finished design (borders, logos, signatures) · PNG or JPG
                </span>
              </>
            )}
          </label>
        ) : (
          <div
            ref={canvasRef}
            className="relative w-full select-none overflow-hidden rounded-lg border border-border bg-white"
            style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
            onPointerDown={() => setSelected(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backgroundUrl}
              alt="Certificate background"
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            />
            {fields.map((field, i) => {
              const selectedCls =
                selected === i
                  ? "outline outline-2 outline-primary"
                  : "outline-dashed outline-1 outline-black/20 hover:outline-black/40";

              // Verify QR — shows the actual QR + caption ("Scan to verify" and
              // the code) exactly as it renders, so the organiser sees the real
              // element rather than a generic icon. Draggable/resizable.
              if (field.key === "verifyQr") {
                const side = field.maxWidth ?? Math.round(canvasWidth * 0.12);
                const capFont = Math.max(7, canvasHeight * 0.015 * scale);
                return (
                  <div
                    key={i}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      startDrag(i, e);
                    }}
                    className={`absolute cursor-move bg-white ${selectedCls}`}
                    style={{
                      left: `${(field.x / canvasWidth) * 100}%`,
                      top: `${(field.y / canvasHeight) * 100}%`,
                      width: `${(side / canvasWidth) * 100}%`,
                      height: `${(side / canvasHeight) * 100}%`,
                    }}
                  >
                    <QrPreviewMatrix />
                    {/* Caption sits beneath the square, like the real render. */}
                    <div
                      className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap text-center leading-tight"
                      style={{ fontSize: capFont, marginTop: capFont * 0.4, color: "#555555" }}
                    >
                      <div>Scan to verify</div>
                      <div>a1b2c3d4e5f6</div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={i}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    startDrag(i, e);
                  }}
                  className={`absolute cursor-move ${selectedCls}`}
                  style={{
                    left: `${(field.x / canvasWidth) * 100}%`,
                    top: `${(field.y / canvasHeight) * 100}%`,
                    width: `${((field.maxWidth ?? canvasWidth) / canvasWidth) * 100}%`,
                    fontSize: field.fontSize * scale,
                    fontFamily: `"${field.fontFamily ?? DEFAULT_FONT}"`,
                    color: field.color ?? "#111111",
                    textAlign: field.align ?? "left",
                    fontWeight: field.bold ? 700 : 400,
                    fontStyle: field.italic ? "italic" : "normal",
                    lineHeight: 1.2,
                    whiteSpace: "normal",
                    overflowWrap: "break-word",
                  }}
                >
                  {field.key === "custom"
                    ? interpolatePreview(field.label || SAMPLE.custom)
                    : SAMPLE[field.key]}
                </div>
              );
            })}
          </div>
        )}

        {backgroundUrl && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addField}>
              <Plus className="h-4 w-4" /> Add field
            </Button>
            <label>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFile}
                disabled={uploading}
              />
              <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium hover:bg-muted">
                {uploading ? (
                  <Spinner className="h-4 w-4 animate-spin" />
                ) : null}
                Replace background
              </span>
            </label>
            <span className="text-xs text-muted-foreground">
              {canvasWidth}×{canvasHeight}px · drag fields to position
            </span>
          </div>
        )}
      </div>

      {/* Inspector -------------------------------------------------------- */}
      <div className="space-y-4">
        <div className="border-t border-border pt-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            {selectedField ? "Field" : "Fields"}
          </h3>

          {!selectedField ? (
            fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add fields and drag them onto the certificate. Dynamic fields
                fill in each recipient&apos;s details at issue time.
              </p>
            ) : (
              <ul className="space-y-1">
                {fields.map((f, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setSelected(i)}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span className="truncate">
                        {f.key === "custom"
                          ? f.label || "Custom text"
                          : FIELD_LABELS[f.key]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="space-y-4">
              {selectedField.key === "verifyQr" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    The verify QR encodes this certificate&apos;s verify link and
                    is required. Drag it to reposition; set its size below.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="certificatedesigner-size-px">Size (px)</Label>
                    <Input id="certificatedesigner-size-px"
                      type="number"
                      value={
                        selectedField.maxWidth ?? Math.round(canvasWidth * 0.12)
                      }
                      onChange={(e) =>
                        patchField(selected!, {
                          maxWidth: Math.max(40, Number(e.target.value) || 40),
                        })
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="certificatedesigner-content">Content</Label>
                    <Select
                      value={selectedField.key}
                      onValueChange={(v) =>
                        patchField(selected!, { key: v as CertificateFieldKey })
                      }
                    >
                      <SelectTrigger id="certificatedesigner-content">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEXT_FIELD_KEYS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {FIELD_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedField.key === "custom" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="certificatedesigner-text">Text</Label>
                      <Input id="certificatedesigner-text"
                        value={selectedField.label ?? ""}
                        onChange={(e) =>
                          patchField(selected!, { label: e.target.value })
                        }
                        placeholder="e.g. Issued by Unifesto on {issueDate}"
                      />
                      <p className="text-xs text-muted-foreground">
                        Insert live values with{" "}
                        {CUSTOM_PLACEHOLDERS.map((p, i) => (
                          <span key={p}>
                            {i > 0 && ", "}
                            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                              {`{${p}}`}
                            </code>
                          </span>
                        ))}
                        .
                      </p>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="certificatedesigner-font">Font</Label>
                    <Select
                      value={selectedField.fontFamily ?? DEFAULT_FONT}
                      onValueChange={(v) =>
                        patchField(selected!, { fontFamily: v })
                      }
                    >
                      <SelectTrigger id="certificatedesigner-font">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {(["Sans", "Serif", "Display", "Script"] as const).map(
                          (cat) => {
                            const inCat = CERTIFICATE_FONTS.filter(
                              (f) => f.category === cat
                            );
                            if (inCat.length === 0) return null;
                            return (
                              <div key={cat}>
                                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                                  {cat === "Script" ? "Cursive & Script" : cat}
                                </div>
                                {inCat.map((f) => (
                                  <SelectItem key={f.family} value={f.family}>
                                    <span style={{ fontFamily: `"${f.family}"` }}>
                                      {f.family}
                                    </span>
                                  </SelectItem>
                                ))}
                              </div>
                            );
                          }
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="certificatedesigner-font-size">Font size</Label>
                      <Input id="certificatedesigner-font-size"
                        type="number"
                        value={selectedField.fontSize}
                        onChange={(e) =>
                          patchField(selected!, {
                            fontSize: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="certificatedesigner-colour">Colour</Label>
                      <input id="certificatedesigner-colour"
                        type="color"
                        value={selectedField.color ?? "#111111"}
                        onChange={(e) =>
                          patchField(selected!, { color: e.target.value })
                        }
                        className="h-10 w-full cursor-pointer rounded-md border border-input bg-card"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="certificatedesigner-text-box-width-px">Text box width (px)</Label>
                    <Input id="certificatedesigner-text-box-width-px"
                      type="number"
                      value={selectedField.maxWidth ?? canvasWidth}
                      onChange={(e) =>
                        patchField(selected!, {
                          maxWidth: Math.max(
                            20,
                            Math.min(canvasWidth, Number(e.target.value) || 20)
                          ),
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Long text wraps to the next line within this width.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="certificatedesigner-alignment">Alignment</Label>
                    <Select
                      value={selectedField.align ?? "left"}
                      onValueChange={(v) =>
                        patchField(selected!, {
                          align: v as "left" | "center" | "right",
                        })
                      }
                    >
                      <SelectTrigger id="certificatedesigner-alignment">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Left</SelectItem>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={selectedField.bold ? "default" : "outline"}
                      size="sm"
                      onClick={() =>
                        patchField(selected!, { bold: !selectedField.bold })
                      }
                    >
                      Bold
                    </Button>
                    <Button
                      type="button"
                      variant={selectedField.italic ? "default" : "outline"}
                      size="sm"
                      onClick={() =>
                        patchField(selected!, { italic: !selectedField.italic })
                      }
                    >
                      Italic
                    </Button>
                  </div>
                </>
              )}

              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(null)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => removeField(selected!)}
                >
                  <Trash className="h-4 w-4" /> Remove
                </Button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={handleSave}
            disabled={saving || uploading}
          >
            {saving ? (
              <Spinner className="h-4 w-4 animate-spin" />
            ) : (
              <FloppyDisk className="h-4 w-4" />
            )}
            {template ? "Save changes" : "Create template"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Read an image file's natural dimensions without uploading it. */
function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
