"use client";

import { useEffect, useState } from "react";
import { X } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { getStatsRecipients, updateStatsRecipients } from "@/lib/api/platform-tools-api";

/** Same rule as the server: bare 10 digits = India, else 11–15 digits with country code. */
function normalize(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** "+919848945690" → "+91 98489 45690"; other country codes as stored. */
function display(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

/**
 * Apex › Stats recipients (web port of the mobile screen): the WhatsApp numbers
 * that get the Unifesto Stats daily snapshot, weekly digest and milestones.
 * Edit the list here, then one Save replaces it on the server.
 */
export default function StatsRecipientsPage() {
  const [saved, setSaved] = useState<string[] | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void getStatsRecipients().then(({ data, error }) => {
      if (error) return setError(error.message);
      setSaved(data?.numbers ?? []);
      setDraft(data?.numbers ?? []);
    });
  }, []);

  const dirty = !!saved && (saved.length !== draft.length || saved.some((n, i) => n !== draft[i]));

  const add = () => {
    if (!input.trim()) return;
    const e164 = normalize(input);
    if (!e164) return setError("Enter a 10-digit Indian number, or a full number with country code.");
    if (draft.includes(e164)) return setError(`${display(e164)} is already on the list.`);
    setDraft([...draft, e164]);
    setInput("");
    setError("");
    setNotice("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    const { data, error } = await updateStatsRecipients(draft);
    setSaving(false);
    if (error || !data) return setError(error?.message ?? "Couldn't save.");
    setSaved(data.numbers);
    setDraft(data.numbers);
    setNotice("Saved. The next stats message goes to this list.");
  };

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="Stats recipients" subtitle="Who gets the Unifesto Stats WhatsApp: daily snapshot, weekly digest and milestones." />
      {error && <ErrorNotice message={error} />}
      {notice && <p className="text-sm text-success">{notice}</p>}

      <Card>
        <CardContent className="space-y-4 p-4">
          {!saved ? (
            <Skeleton className="h-24 w-full" />
          ) : draft.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody yet. Stats messages go nowhere until you add a number.</p>
          ) : (
            <ul className="divide-y divide-border">
              {draft.map((n) => (
                <li key={n} className="flex items-center justify-between py-2 text-sm">
                  <span className="tabular-nums text-foreground">{display(n)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${display(n)}`}
                    onClick={() => {
                      setDraft(draft.filter((x) => x !== n));
                      setNotice("");
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="98765 43210 or +44 7700 900123"
              aria-label="WhatsApp number to add"
              inputMode="tel"
            />
            <Button type="submit" variant="outline">
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(saved ?? [])} disabled={saving}>
            Discard changes
          </Button>
        )}
      </div>
    </div>
  );
}
