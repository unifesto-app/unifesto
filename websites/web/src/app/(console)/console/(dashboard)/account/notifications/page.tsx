"use client";

import { useEffect, useState } from "react";
import {
  getNotificationSettings,
  resubscribeToSpace,
  updateNotificationSettings,
  type NotificationSettings,
} from "@/lib/api/account";
import { useWebSession } from "@/lib/auth";

type Toggle = "emailEnabled" | "emailEventReminders" | "emailNewEvents" | "promotions" | "marketingEmail" | "marketingWhatsapp";

/**
 * K19: email and marketing settings, on the same API and with the same labels
 * as the app. Push and quiet hours belong to the device, so they stay in the app.
 */
export default function NotificationsPage() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const [s, setS] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) getNotificationSettings(token).then(setS, (e) => setError(e.message));
  }, [token]);

  // Flip at once, put it back if the save fails.
  const toggle = async (key: Toggle) => {
    if (!s) return;
    const before = s;
    const value = !s[key];
    setS({ ...s, [key]: value });
    setError("");
    try {
      setS(await updateNotificationSettings(token, { [key]: value }));
    } catch (e) {
      setS(before);
      setError(e instanceof Error ? e.message : "Couldn't save that.");
    }
  };

  const resubscribe = async (spaceId: string) => {
    setError("");
    try {
      setS(await resubscribeToSpace(token, spaceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't re-subscribe.");
    }
  };

  if (!s) return error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-paper/65">Loading…</p>;

  const emailOff = !s.emailEnabled;
  const row = (label: string, key: Toggle, disabled = false) => (
    <label className={`flex items-center justify-between gap-4 py-3 ${disabled ? "opacity-50" : ""}`}>
      <span className="text-sm text-paper">{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={!!s[key] && !disabled}
        disabled={disabled}
        onChange={() => toggle(key)}
        className="h-5 w-5 shrink-0 accent-[var(--primary)]"
      />
    </label>
  );
  const fixed = (label: string, note: string) => (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-paper">{label}</span>
      <span className="text-xs text-paper/55">{note}</span>
    </div>
  );

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-base font-semibold text-paper">Email</h2>
        <p className="mt-1 text-sm text-paper/60">Turns off all optional email. Tickets, receipts and sign-in codes still arrive.</p>
        <div className="mt-2 divide-y divide-white/[0.06]">{row("Email", "emailEnabled")}</div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-paper">What I get by email</h2>
        <div className="mt-2 divide-y divide-white/[0.06]">
          {fixed("Tickets and waitlist", "Always")}
          {row("Reminders", "emailEventReminders", emailOff)}
          {row("New events", "emailNewEvents", emailOff)}
          {fixed("My spaces", "Always")}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-paper">Promotions</h2>
        <p className="mt-1 text-sm text-paper/60">
          Offers from Unifesto need the first switch. Email and WhatsApp cover all marketing, from Unifesto and from spaces I
          joined.
        </p>
        <div className="mt-2 divide-y divide-white/[0.06]">
          {row("Offers from Unifesto", "promotions")}
          {s.marketingEmail != null && row("Marketing email", "marketingEmail")}
          {s.marketingWhatsapp != null && row("Marketing on WhatsApp", "marketingWhatsapp")}
        </div>
        {s.spaceOptOuts.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-paper/75">Spaces I unsubscribed from</h3>
            <ul className="mt-1 divide-y divide-white/[0.06]">
              {s.spaceOptOuts.map((sp) => (
                <li key={sp.spaceId} className="flex items-center justify-between gap-4 py-3">
                  <span className="text-sm text-paper">{sp.spaceName}</span>
                  <button type="button" onClick={() => resubscribe(sp.spaceId)} className="text-sm font-medium text-primary hover:underline">
                    Re-subscribe
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-xs text-paper/55">Push notifications and quiet hours are set in the Unifesto app.</p>
    </div>
  );
}
