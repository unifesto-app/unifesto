"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash, FloppyDisk, Spinner, TextT, QrCode } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CertificateField,
  CertificateFieldKey,
  CertificateTemplate,
  CERTIFICATE_FONTS,
  CERTIFICATE_FONTS_STYLESHEET,
  createTemplate,
  updateTemplate,
  uploadCertificateBackground,
} from "@/lib/api/certificates-api";

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
    y: Math.round(canvasHeight - size - canvasHeight * 0.1),
    fontSize: 20,
    maxWidth: size,
  };
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

    // Seed a verify QR on a brand-new template so every certificate carries a
    // scannable verify path by default; the organiser can move or resize it.
    setFields((f) =>
      f.some((x) => x.key === "verifyQr")
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
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
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
          <label className="flex aspect-[1.414/1] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 text-muted-foreground hover:bg-muted/50">
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

              // Verify QR — a square placeholder the organiser can drag/resize.
              if (field.key === "verifyQr") {
                const side = field.maxWidth ?? Math.round(canvasWidth * 0.12);
                return (
                  <div
                    key={i}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      startDrag(i, e);
                    }}
                    className={`absolute flex cursor-move items-center justify-center bg-white/80 ${selectedCls}`}
                    style={{
                      left: `${(field.x / canvasWidth) * 100}%`,
                      top: `${(field.y / canvasHeight) * 100}%`,
                      width: `${(side / canvasWidth) * 100}%`,
                      height: `${(side / canvasHeight) * 100}%`,
                    }}
                  >
                    <QrCode
                      className="text-black/70"
                      style={{ width: "70%", height: "70%" }}
                      weight="regular"
                    />
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
                    lineHeight: 1.1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {field.key === "custom"
                    ? field.label || SAMPLE.custom
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
        <div className="rounded-lg border border-border bg-card p-4">
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
            <div className="space-y-3">
              {selectedField.key === "verifyQr" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    The verify QR encodes this certificate&apos;s verify link and
                    is required. Drag it to reposition; set its size below.
                  </p>
                  <div className="space-y-1.5">
                    <Label>Size (px)</Label>
                    <Input
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
                    <Label>Content</Label>
                    <Select
                      value={selectedField.key}
                      onValueChange={(v) =>
                        patchField(selected!, { key: v as CertificateFieldKey })
                      }
                    >
                      <SelectTrigger>
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
                      <Label>Text</Label>
                      <Input
                        value={selectedField.label ?? ""}
                        onChange={(e) =>
                          patchField(selected!, { label: e.target.value })
                        }
                        placeholder="e.g. has successfully completed"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label>Font</Label>
                    <Select
                      value={selectedField.fontFamily ?? DEFAULT_FONT}
                      onValueChange={(v) =>
                        patchField(selected!, { fontFamily: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CERTIFICATE_FONTS.map((f) => (
                          <SelectItem key={f.family} value={f.family}>
                            <span style={{ fontFamily: `"${f.family}"` }}>
                              {f.family}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Font size</Label>
                      <Input
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
                      <Label>Colour</Label>
                      <input
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
                    <Label>Alignment</Label>
                    <Select
                      value={selectedField.align ?? "left"}
                      onValueChange={(v) =>
                        patchField(selected!, {
                          align: v as "left" | "center" | "right",
                        })
                      }
                    >
                      <SelectTrigger>
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
