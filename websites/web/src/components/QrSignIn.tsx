"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { call } from "@/lib/api/registration";
import { startSession } from "@/lib/auth";

/** What the app's Link a device scanner accepts. Not a URL, so a link in a message can't approve anything. */
const PREFIX = "unifesto-link:";

type Poll =
  | { status: "pending" }
  | { status: "approved"; accessToken: string; refreshToken: string; fullName: string | null };

/**
 * Sign in by scanning a code with the Unifesto app on a phone that's already
 * signed in. A fresh code every two minutes until one is approved; then the
 * shared session updates, as after the email code.
 */
export default function QrSignIn({ onCancel }: { onCancel: () => void }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = () => {
      if (!stopped) setError("Couldn't show a code. Use your email instead.");
    };
    const show = async () => {
      const link = await call<{ code: string; secret: string; expiresIn: number }>("POST", "/auth/qr");
      const image = await QRCode.toString(PREFIX + link.code, {
        type: "svg",
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
      });
      if (stopped) return;
      setSvg(image);
      const until = Date.now() + link.expiresIn * 1000;
      const poll = async () => {
        if (stopped) return;
        if (Date.now() > until) return void show().catch(fail);
        const res = await call<Poll>("POST", "/auth/qr/poll", { code: link.code, secret: link.secret }).catch(() => null);
        if (stopped) return;
        if (res?.status === "approved") return void startSession(res, { email: "", fullName: res.fullName });
        timer = setTimeout(poll, 2000);
      };
      timer = setTimeout(poll, 2000);
    };
    show().catch(fail);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-paper/75">
        Open Unifesto on your phone, go to Account settings, tap <strong className="text-paper">Link a device</strong>{" "}
        and scan this code.
      </p>
      <div className="mx-auto w-52 rounded-2xl bg-white p-3" role="img" aria-label="Sign-in code for the Unifesto app">
        {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="aspect-square" />}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="button" onClick={onCancel} className="text-sm text-paper/65 hover:text-paper">
        Use my email instead
      </button>
    </div>
  );
}
