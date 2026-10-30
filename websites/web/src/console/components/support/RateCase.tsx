"use client";

import { useState } from "react";
import { Star } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { Textarea } from "@/console/components/ui/textarea";
import { cn } from "@/console/lib/utils/cn";
import { rateTicket, type SupportTicket } from "@/console/lib/api/support-api";

/** D20: the requester rates a resolved case 1-5, with an optional comment. */
export function RateCase({ ticket, onRated }: { ticket: SupportTicket; onRated: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (ticket.rating) {
    return (
      <p className="text-sm text-muted-foreground">
        You rated this {ticket.rating} of 5{ticket.ratingComment ? `: "${ticket.ratingComment}"` : ""}. Thanks for telling us.
      </p>
    );
  }

  const send = async () => {
    setSaving(true);
    setError("");
    const { error } = await rateTicket(ticket.id, rating, comment.trim() || undefined);
    setSaving(false);
    if (error) setError(error.message || "Could not save your rating.");
    else onRated();
  };

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <p className="text-sm font-medium text-foreground">How did we do?</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} of 5`}
            onClick={() => setRating(n)}
            className="rounded p-0.5 text-warning"
          >
            <Star className={cn("h-6 w-6", n > rating && "text-muted-foreground")} weight={n <= rating ? "fill" : "regular"} />
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Anything to add? (optional)"
            aria-label="Comment"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button size="sm" onClick={send} disabled={saving}>
            {saving ? "Sending…" : "Send rating"}
          </Button>
        </>
      )}
    </div>
  );
}
