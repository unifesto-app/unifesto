"use client";

import { useEffect, useState } from "react";
import { getSpaceFee, setSpaceFeePayer, type SpaceFee } from "@/lib/api/subscriptions-api";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { confirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Platform admin: who pays the processing fee on this space's events. Only
 * Unifesto sets it (12 Nov 2026). It applies to every event of the space now
 * and to the events it creates later.
 */
export function SpaceFeePayerCard({ spaceId }: { spaceId: string }) {
  const [fee, setFee] = useState<SpaceFee | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getSpaceFee(spaceId).then(({ data, error }) => (error ? setError(error.message) : setFee(data)));
  }, [spaceId]);

  const set = async (included: boolean) => {
    const ok = await confirmDialog({
      title: included ? "Include the fee in ticket prices?" : "Buyers pay the fee on top?",
      description: included
        ? "Every event in this space switches: buyers pay the listed price and the fee comes out of the organiser's share. New sales only."
        : "Every event in this space switches: buyers pay the fee on top of the listed price at checkout. New sales only.",
      confirmLabel: "Switch every event",
    });
    if (!ok) return;
    setSaving(true);
    setError("");
    const { data, error } = await setSpaceFeePayer(spaceId, included);
    setSaving(false);
    if (error) return setError(error.message || "Could not change who pays.");
    if (data) setFee((f) => (f ? { ...f, included: data.included } : f));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who pays the processing fee</CardTitle>
        <CardDescription>Unifesto&apos;s call. Applies to every event in this space and to new ones.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <ErrorNotice message={error} />}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={fee && !fee.included ? "default" : "outline"}
            disabled={!fee || saving || !fee.included}
            onClick={() => set(false)}
          >
            Buyer, on top
          </Button>
          <Button
            variant={fee?.included ? "default" : "outline"}
            disabled={!fee || saving || fee.included}
            onClick={() => set(true)}
          >
            Organiser (PF included)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
