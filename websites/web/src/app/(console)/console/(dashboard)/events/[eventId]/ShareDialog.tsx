"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, DownloadSimple, WhatsappLogo } from "@unifesto/unicon/react";
import { SITE } from "@/lib/site";
import type { Event } from "@/console/lib/api/events-api";
import { posterPng } from "@/console/lib/poster";
import { useCopy } from "@/console/components/tracking/TrackingParts";
import { Button } from "@/console/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/console/components/ui/dialog";

/**
 * Q23: shown straight after publishing, so the link goes out while the
 * organiser is still here: copy it, send it on WhatsApp, print a QR poster.
 * No short link (S60 retires them).
 */
export function ShareDialog({
  event,
  open,
  onOpenChange,
}: {
  event: Event;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const url = `${SITE.url}/event/${event.slug}`;
  const { copied, copy } = useCopy();
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (open) QRCode.toDataURL(url, { margin: 1, width: 256 }).then(setQr, () => setQr(""));
  }, [open, url]);

  const downloadPoster = async () => {
    const a = document.createElement("a");
    a.href = await posterPng(event, url);
    a.download = `${event.slug}-poster.png`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{event.title} is live</DialogTitle>
          <DialogDescription>Share it now, while it&apos;s fresh.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
              {url.replace(/^https:\/\//, "")}
            </p>
            <Button size="sm" variant="outline" onClick={() => copy(url)}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>

          <Button asChild className="w-full">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${event.title}\n${url}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              <WhatsappLogo className="h-4 w-4" />
              Share on WhatsApp
            </a>
          </Button>

          <div className="flex items-center gap-4 border-t border-border pt-4">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element -- a data URL from the qrcode encoder
              <img src={qr} alt={`QR code for ${url}`} className="h-24 w-24 rounded-md bg-white p-1" />
            )}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">An A4 poster with this QR, for notice boards and standees.</p>
              <Button size="sm" variant="outline" onClick={downloadPoster}>
                <DownloadSimple className="h-4 w-4" />
                Download QR poster
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
