import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { existsSync } from 'fs';
import axios from 'axios';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import sharp from 'sharp';
import {
  createCanvas,
  loadImage,
  GlobalFonts,
  type SKRSContext2D,
} from '@napi-rs/canvas';
import {
  CERTIFICATE_FONTS,
  DEFAULT_FONT_FAMILY,
  fontFilePath,
  normaliseFamily,
} from './certificate-fonts';

/**
 * One positioned element on a certificate. Coordinates are authored in the
 * template's canvas space, so an element placed once renders identically at any
 * output resolution.
 *
 * Text convention (shared by BOTH renderers so PDF and PNG never drift):
 *   - (x, y) is the TOP-LEFT of the text box.
 *   - `maxWidth` is the box width; alignment happens inside [x, x+maxWidth].
 *   - `fontSize` is in canvas px, which map 1:1 to PDF points.
 *
 * The `verifyQr` element is special: it is not text but the verify QR code,
 * with (x, y) its top-left and `maxWidth` its square side; the code caption is
 * drawn centred beneath it.
 */
export interface CertificateFieldDef {
  key:
    | 'recipientName'
    | 'eventTitle'
    | 'issueDate'
    | 'certificateNumber'
    | 'custom'
    | 'verifyQr';
  /** Static text for a `custom` field; ignored otherwise. */
  label?: string;
  x: number;
  y: number;
  fontSize: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  maxWidth?: number;
  /** One of CERTIFICATE_FONTS; defaults to Helvetica. */
  fontFamily?: string;
}

export interface CertificateRenderInput {
  backgroundUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  fields: CertificateFieldDef[];
  values: Record<string, string>;
  /** Full public verify URL encoded into the QR code. */
  verifyUrl: string;
  /** The verification code, printed beside/beneath the QR. */
  verifyCode: string;
}

/**
 * Raster ceiling: A4 at 300 dpi (3508 x 2480). Templates may be authored up to
 * 10000 px a side; a canvas that size is ~400 MB of native Skia memory per
 * render, which OOM-killed replicas (S20). Output above this is scaled down;
 * layout stays in template coordinates, so only the resolution changes.
 */
export const MAX_RENDER_SIDE = 3508;
export const MAX_RENDER_PIXELS = 3508 * 2480;

/** Scale factor (<= 1) that fits w x h inside the raster ceiling. */
export function renderScale(w: number, h: number): number {
  return Math.min(
    1,
    MAX_RENDER_SIDE / Math.max(w, h),
    Math.sqrt(MAX_RENDER_PIXELS / (w * h)),
  );
}

/** Background + QR bytes, fetched once and shared by both renderers. */
interface RenderAssets {
  background: Buffer;
  qr: Buffer;
  /** Output scale for the PNG (see {@link renderScale}). */
  scale: number;
}

/** Where the QR + its caption sit, in canvas coordinates. */
interface QrPlacement {
  qrX: number;
  qrY: number;
  qrSize: number;
  caption: {
    left: number;
    width: number;
    topY: number;
    font: number;
    align: 'left' | 'center' | 'right';
  };
}

/** Register the bundled TTFs with @napi-rs/canvas exactly once per process. */
let canvasFontsRegistered = false;
function ensureCanvasFonts(logger: Logger): void {
  if (canvasFontsRegistered) return;
  canvasFontsRegistered = true;
  for (const font of CERTIFICATE_FONTS) {
    if (!font.regular) continue; // Helvetica → aliased below / system sans
    const reg = fontFilePath(font.family, false);
    const bold = fontFilePath(font.family, true);
    try {
      // Register regular + bold under the same family so Skia matches the CSS
      // `bold` weight; skip when a single-weight script font reuses Regular.
      if (reg) GlobalFonts.registerFromPath(reg, font.family);
      if (bold && bold !== reg) GlobalFonts.registerFromPath(bold, font.family);
    } catch (err) {
      logger.warn(`Could not register font ${font.family}: ${String(err)}`);
    }
  }

  // The default "Helvetica" has no bundled file. node-canvas leaned on a
  // Cairo/Pango/fontconfig stack to substitute it; with Skia we alias the base
  // DejaVu sans (present in the runtime image) so "Helvetica" resolves
  // deterministically. Absent on dev machines → Skia falls back to the OS sans.
  const dejavu: readonly [string, boolean][] = [
    ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', false],
    ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', true],
  ];
  for (const [path] of dejavu) {
    try {
      if (existsSync(path)) GlobalFonts.registerFromPath(path, 'Helvetica');
    } catch (err) {
      logger.warn(`Could not register default sans: ${String(err)}`);
    }
  }
}

/**
 * Turns a template + resolved values into the two artifacts we ship: a
 * print-quality vector PDF (pdfkit) and a share-friendly raster PNG
 * (node-canvas). Both draw the same background, the same fields with the same
 * bundled fonts, and the same verify QR, so the download and the social image
 * are the same certificate.
 */
@Injectable()
export class CertificateRenderService {
  private readonly logger = new Logger(CertificateRenderService.name);

  /** Fetch the template background once; both renderers reuse the bytes. */
  private async fetchBackground(url: string): Promise<Buffer> {
    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
      });
      return Buffer.from(res.data);
    } catch (error) {
      this.logger.error(`Failed to fetch certificate background: ${url}`, error);
      throw new BadRequestException(
        'Could not load the certificate background image',
      );
    }
  }

  /**
   * The visible text for a field: static label for custom, else the value.
   *
   * A `custom` field's label may embed placeholders — `{recipientName}`,
   * `{eventTitle}`, `{issueDate}`, `{certificateNumber}`, `{spaceName}` — which
   * are substituted from `values` so a footer like "Issued by Unifesto on
   * {issueDate}" prints the real date. Unknown placeholders are left untouched.
   */
  private resolveText(
    field: CertificateFieldDef,
    values: Record<string, string>,
  ): string {
    if (field.key === 'verifyQr') return '';
    if (field.key === 'custom') return this.interpolate(field.label ?? '', values);
    return values[field.key] ?? '';
  }

  /** Replace `{key}` tokens with `values[key]`, leaving unknown tokens as-is. */
  private interpolate(text: string, values: Record<string, string>): string {
    return text.replace(/\{(\w+)\}/g, (match, key: string) =>
      key in values ? values[key] : match,
    );
  }

  private boxWidth(field: CertificateFieldDef, canvasWidth: number): number {
    return field.maxWidth ?? canvasWidth - field.x;
  }

  /**
   * Resolve where the QR + caption go. If the template has a `verifyQr` field,
   * the organiser has placed and sized it — QR at its box, caption centred
   * beneath. Otherwise fall back to the auto-stamped bottom-right corner, so a
   * certificate can never end up with no verify path.
   */
  private qrPlacement(input: CertificateRenderInput): QrPlacement {
    const w = input.canvasWidth;
    const h = input.canvasHeight;
    const font = Math.max(9, Math.round(h * 0.015));
    const qrField = input.fields.find((f) => f.key === 'verifyQr');

    if (qrField) {
      const qrSize = qrField.maxWidth ?? Math.round(w * 0.12);
      const capWidth = Math.max(qrSize * 3, Math.round(w * 0.25));
      const left = Math.max(
        0,
        Math.min(qrField.x + qrSize / 2 - capWidth / 2, w - capWidth),
      );
      return {
        qrX: qrField.x,
        qrY: qrField.y,
        qrSize,
        caption: {
          left,
          width: capWidth,
          topY: qrField.y + qrSize + Math.round(h * 0.008),
          font,
          align: 'center',
        },
      };
    }

    // Default bottom-right corner, caption to its left (right-aligned).
    const qrSize = Math.round(w * 0.1);
    const margin = Math.round(w * 0.03);
    const gap = Math.round(margin * 0.6);
    const qrX = w - margin - qrSize;
    const qrY = h - margin - qrSize;
    return {
      qrX,
      qrY,
      qrSize,
      caption: {
        left: margin,
        width: qrX - gap - margin,
        topY: qrY + qrSize / 2 - font * 1.1,
        font,
        align: 'right',
      },
    };
  }

  /** QR PNG for the verify URL. Rendered generously then scaled for crispness. */
  private async qrPng(verifyUrl: string): Promise<Buffer> {
    return QRCode.toBuffer(verifyUrl, {
      type: 'png',
      width: 600,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
  }

  private captionLines(verifyCode: string): [string, string] {
    return ['Scan to verify', verifyCode];
  }

  // ==========================================================================
  // PNG  (node-canvas — reliable custom fonts via registerFont)
  // ==========================================================================

  /**
   * Both artifacts for one certificate. The background is downloaded once (it
   * used to be fetched by each renderer) and capped to the raster ceiling, and
   * the two renders run one after the other so peak native memory is one
   * canvas, not two.
   */
  async renderAll(
    input: CertificateRenderInput,
  ): Promise<{ pdf: Buffer; png: Buffer }> {
    const scale = renderScale(input.canvasWidth, input.canvasHeight);
    const [rawBackground, qr] = await Promise.all([
      this.fetchBackground(input.backgroundUrl),
      this.qrPng(input.verifyUrl),
    ]);
    const background = await this.capBackground(
      rawBackground,
      Math.floor(input.canvasWidth * scale),
      Math.floor(input.canvasHeight * scale),
    );
    const assets = { background, qr, scale };
    const pdf = await this.renderPdf(input, assets);
    const png = await this.renderPng(input, assets);
    return { pdf, png };
  }

  /**
   * Shrink an oversized background to the output size with libvips (streams,
   * shrink-on-load) before Skia ever decodes it at full size. Smaller images,
   * or bytes sharp can't read, pass through untouched.
   */
  private async capBackground(
    buf: Buffer,
    width: number,
    height: number,
  ): Promise<Buffer> {
    try {
      const meta = await sharp(buf).metadata();
      if ((meta.width ?? 0) <= width && (meta.height ?? 0) <= height) return buf;
      return await sharp(buf)
        .resize(width, height, { fit: 'fill' })
        .png({ compressionLevel: 1 })
        .toBuffer();
    } catch {
      return buf;
    }
  }

  private async renderPng(
    input: CertificateRenderInput,
    assets: RenderAssets,
  ): Promise<Buffer> {
    ensureCanvasFonts(this.logger);
    const placement = this.qrPlacement(input);
    const { scale } = assets;

    const canvas = createCanvas(
      Math.floor(input.canvasWidth * scale),
      Math.floor(input.canvasHeight * scale),
    );
    const ctx = canvas.getContext('2d');
    // Draw in template coordinates; the transform does the downscale.
    ctx.scale(scale, scale);

    // Full-bleed background.
    const bg = await loadImage(assets.background);
    ctx.drawImage(bg, 0, 0, input.canvasWidth, input.canvasHeight);

    // Text fields.
    for (const field of input.fields) {
      const text = this.resolveText(field, input.values);
      if (!text) continue;

      const family = normaliseFamily(field.fontFamily);
      const style = field.italic ? 'italic ' : '';
      const weight = field.bold ? 'bold ' : '';
      ctx.font = `${style}${weight}${field.fontSize}px "${family}"`;
      ctx.fillStyle = field.color ?? '#000000';
      ctx.textAlign = field.align ?? 'left';
      ctx.textBaseline = 'top';

      const boxW = this.boxWidth(field, input.canvasWidth);
      const align = field.align ?? 'left';
      const anchorX =
        align === 'center'
          ? field.x + boxW / 2
          : align === 'right'
            ? field.x + boxW
            : field.x;

      this.drawWrapped(
        ctx,
        text,
        anchorX,
        field.y,
        boxW,
        field.fontSize * 1.2,
      );
    }

    // Verify QR + caption.
    const qrImg = await loadImage(assets.qr);
    ctx.drawImage(
      qrImg,
      placement.qrX,
      placement.qrY,
      placement.qrSize,
      placement.qrSize,
    );

    const [line1, line2] = this.captionLines(input.verifyCode);
    const cap = placement.caption;
    ctx.font = `${cap.font}px "Helvetica"`;
    ctx.fillStyle = '#555555';
    ctx.textAlign = cap.align;
    ctx.textBaseline = 'top';
    const capX =
      cap.align === 'center'
        ? cap.left + cap.width / 2
        : cap.align === 'right'
          ? cap.left + cap.width
          : cap.left;
    ctx.fillText(line1, capX, cap.topY, cap.width);
    ctx.fillText(line2, capX, cap.topY + cap.font * 1.2, cap.width);

    // Async encode: the sync toBuffer blocked the event loop for the whole
    // PNG compression, stalling every request on this replica.
    return canvas.encode('png');
  }

  /** Word-wrap `text` into `maxW` and draw each line; `ctx.textAlign` set by caller. */
  private drawWrapped(
    ctx: SKRSContext2D,
    text: string,
    anchorX: number,
    topY: number,
    maxW: number,
    lineHeight: number,
  ): void {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(test).width > maxW) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    lines.forEach((line, i) => ctx.fillText(line, anchorX, topY + i * lineHeight));
  }

  // ==========================================================================
  // PDF  (pdfkit — bundled fonts registered per document)
  // ==========================================================================

  private async renderPdf(
    input: CertificateRenderInput,
    { background, qr }: RenderAssets,
  ): Promise<Buffer> {
    const placement = this.qrPlacement(input);

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: [input.canvasWidth, input.canvasHeight],
          margin: 0,
        });

        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Registered font names, so each TTF is embedded only once per doc.
        const registered = new Set<string>();
        const useFont = (field: CertificateFieldDef) => {
          const family = normaliseFamily(field.fontFamily);
          if (family === DEFAULT_FONT_FAMILY) {
            doc.font(this.helvetica(field));
            return;
          }
          const path =
            fontFilePath(family, !!field.bold) ?? fontFilePath(family, false);
          if (!path) {
            doc.font(this.helvetica(field));
            return;
          }
          const name = `${family}-${field.bold ? 'b' : 'r'}`;
          if (!registered.has(name)) {
            doc.registerFont(name, path);
            registered.add(name);
          }
          doc.font(name);
        };

        // Full-bleed background.
        doc.image(background, 0, 0, {
          width: input.canvasWidth,
          height: input.canvasHeight,
        });

        // Text fields.
        for (const field of input.fields) {
          const text = this.resolveText(field, input.values);
          if (!text) continue;
          useFont(field);
          doc
            .fontSize(field.fontSize)
            .fillColor(field.color ?? '#000000')
            .text(text, field.x, field.y, {
              width: this.boxWidth(field, input.canvasWidth),
              align: field.align ?? 'left',
              lineBreak: true,
            });
        }

        // Verify QR + caption.
        doc.image(qr, placement.qrX, placement.qrY, {
          width: placement.qrSize,
          height: placement.qrSize,
        });
        const [line1, line2] = this.captionLines(input.verifyCode);
        const cap = placement.caption;
        doc
          .font('Helvetica')
          .fontSize(cap.font)
          .fillColor('#555555')
          .text(`${line1}\n${line2}`, cap.left, cap.topY, {
            width: cap.width,
            align: cap.align,
            lineBreak: true,
          });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /** Built-in Helvetica variant for a field's bold/italic. */
  private helvetica(field: CertificateFieldDef): string {
    if (field.bold && field.italic) return 'Helvetica-BoldOblique';
    if (field.bold) return 'Helvetica-Bold';
    if (field.italic) return 'Helvetica-Oblique';
    return 'Helvetica';
  }
}
