"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { UpiWay } from "@/lib/razorpay";

/** Q40: while a UPI payment waits. A desktop shows the QR to scan; a phone says to finish in the UPI app. */
export default function UpiWait({ way, qr, amount, onCancel }: { way: UpiWay; qr: string | null; amount: string; onCancel: () => void }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let live = true;
    if (qr) {
      QRCode.toString(qr, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } }).then(
        (s) => live && setSvg(s),
        () => undefined,
      );
    }
    return () => {
      live = false;
    };
  }, [qr]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-canvas/80 px-5 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="upi-wait-title" className="w-full max-w-sm rounded-3xl bg-night-2 p-6 text-center sm:p-8">
        <h2 id="upi-wait-title" className="font-display text-xl text-paper">
          {way === "qr" ? `Scan to pay ${amount}` : `Pay ${amount} in your UPI app`}
        </h2>
        {way === "qr" && (
          <div className="mx-auto mt-5 w-52 rounded-2xl bg-white p-3" role="img" aria-label="UPI payment code">
            {qr && svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="aspect-square" />}
          </div>
        )}
        <p className="mt-4 text-sm text-paper/70" aria-live="polite">
          {way === "intent"
            ? "Approve it in your UPI app, then come back here. This page moves on once you've paid."
            : qr
              ? "Open any UPI app on your phone and scan this code. This page moves on once you've paid."
              : "Getting your code…"}
        </p>
        <button type="button" autoFocus onClick={onCancel} className="btn btn-secondary mt-6 w-full">
          Cancel
        </button>
      </div>
    </div>
  );
}
