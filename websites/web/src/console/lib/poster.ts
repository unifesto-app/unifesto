import QRCode from "qrcode";
import type { Event } from "@/console/lib/api/events-api";

/** "Sat, 8 Nov, 10:00 am" in the event's own time zone. */
function when(event: Event) {
  return new Date(event.startDateTime).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timezone || "Asia/Kolkata",
  });
}

/** Greedy word wrap to `width`, at most `max` lines (the last one cut with an ellipsis). */
export function wrap(ctx: Pick<CanvasRenderingContext2D, "measureText">, text: string, width: number, max: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > max) lines.splice(max - 1, Infinity, `${lines[max - 1]}…`);
  return lines;
}

/** An A4 poster at 150 dpi: title, when and where, and a big QR to the event page. */
export async function posterPng(event: Event, url: string) {
  const W = 1240;
  const H = 1754;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  // The console's own typeface, already loaded on the page.
  const font = getComputedStyle(document.body).fontFamily;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";

  ctx.font = `600 80px ${font}`;
  let y = 220;
  for (const line of wrap(ctx, event.title, W - 240, 3)) {
    ctx.fillText(line, W / 2, y);
    y += 96;
  }
  ctx.font = `400 40px ${font}`;
  const where = event.type === "ONLINE" ? "Online" : [event.venueName, event.city].filter(Boolean).join(", ");
  for (const line of [when(event), where].filter(Boolean)) {
    ctx.fillText(line, W / 2, y + 16);
    y += 58;
  }

  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, url, { margin: 0, width: 760 });
  ctx.drawImage(qr, (W - 760) / 2, 660);

  ctx.font = `600 48px ${font}`;
  ctx.fillText("Scan to register", W / 2, 1530);
  ctx.font = `400 34px ${font}`;
  ctx.fillText(url.replace(/^https:\/\//, ""), W / 2, 1590);
  return canvas.toDataURL("image/png");
}
