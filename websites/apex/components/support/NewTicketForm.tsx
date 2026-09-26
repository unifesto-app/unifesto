"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createTicket,
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  type SupportTicketCategory,
  type SupportTicketPriority,
} from "@/lib/api/support-api";

const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABEL) as SupportTicketCategory[];
const PRIORITY_OPTIONS = Object.keys(PRIORITY_LABEL) as SupportTicketPriority[];

/**
 * Inline composer for a new support ticket. Used by the organiser self-service
 * surfaces (platform-wide support page and the per-space support tab). Pass
 * `spaceId` to scope the ticket to a space.
 */
export function NewTicketForm({
  onClose,
  onCreated,
  spaceId,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  spaceId?: string;
}) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<SupportTicketCategory>("GENERAL");
  const [priority, setPriority] = useState<SupportTicketPriority>("NORMAL");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!subject.trim() || !message.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    const { data, error } = await createTicket({
      subject: subject.trim(),
      message: message.trim(),
      category,
      priority,
      spaceId,
    });
    setSubmitting(false);
    if (error || !data) {
      setError(error?.message || "Could not create the ticket.");
      return;
    }
    onCreated(data.id);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">New support ticket</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorNotice message={error} />}
        <div className="space-y-1.5">
          <Label htmlFor="ticket-subject">Subject</Label>
          <Input
            id="ticket-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Briefly, what’s the issue?"
            maxLength={300}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as SupportTicketCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as SupportTicketPriority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticket-message">Message</Label>
          <Textarea
            id="ticket-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe what’s happening, and any steps to reproduce it."
            rows={5}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!subject.trim() || !message.trim() || submitting}
          >
            {submitting ? "Creating…" : "Create ticket"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
