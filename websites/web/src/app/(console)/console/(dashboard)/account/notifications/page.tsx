"use client";

import { useEffect, useState } from "react";
import {
  getNotificationSettings,
  resubscribeToSpace,
  updateNotificationSettings,
  type NotificationSettings,
} from "@/lib/api/account";
import { useWebSession } from "@/lib/auth";
import { Toggle } from "@/console/components/hackathon/HackParts";
import { Button } from "@/console/components/ui/button";
import Section from "../Section";

type Setting = "emailEnabled" | "emailEventReminders" | "emailNewEvents" | "promotions" | "marketingEmail" | "marketingWhatsapp";

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
  const toggle = async (key: Setting) => {
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

  if (!s) return error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-sm text-muted-foreground">Loading…</p>;

  const emailOff = !s.emailEnabled;
  const row = (label: string, key: Setting, disabled = false) => (
    <div className="py-3">
      <Toggle label={label} checked={!!s[key] && !disabled} disabled={disabled} onChange={() => toggle(key)} />
    </div>
  );
  const fixed = (label: string, note: string) => (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </div>
  );

  return (
    <div>
      <Section title="Email" description="Turns off all optional email. Tickets, receipts and sign-in codes still arrive.">
        <div className="-my-3 divide-y divide-border">{row("Email", "emailEnabled")}</div>
      </Section>

      <Section title="What I get by email">
        <div className="-my-3 divide-y divide-border">
          {fixed("Tickets and waitlist", "Always")}
          {row("Reminders", "emailEventReminders", emailOff)}
          {row("New events", "emailNewEvents", emailOff)}
          {fixed("My spaces", "Always")}
        </div>
      </Section>

      <Section
        title="Promotions"
        description="Offers from Unifesto need the first switch. Email and WhatsApp cover all marketing, from Unifesto and from spaces I joined."
      >
        <div className="-my-3 divide-y divide-border">
          {row("Offers from Unifesto", "promotions")}
          {s.marketingEmail != null && row("Marketing email", "marketingEmail")}
          {s.marketingWhatsapp != null && row("Marketing on WhatsApp", "marketingWhatsapp")}
        </div>
        {s.spaceOptOuts.length > 0 && (
          <div className="pt-6">
            <h3 className="text-sm font-medium text-foreground">Spaces I unsubscribed from</h3>
            <ul className="mt-1 divide-y divide-border">
              {s.spaceOptOuts.map((sp) => (
                <li key={sp.spaceId} className="flex items-center justify-between gap-4 py-3">
                  <span className="text-sm text-foreground">{sp.spaceName}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => resubscribe(sp.spaceId)}>
                    Re-subscribe
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <div className="space-y-2 border-t border-border pt-6">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">Push notifications and quiet hours are set in the Unifesto app.</p>
      </div>
    </div>
  );
}
