"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Handshake } from "@unifesto/unicon/react";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Skeleton } from "@/console/components/ui/skeleton";
import { useCopy } from "./TrackingParts";
import { createPartnerLink, getPartnerLinks, revokePartnerLink, type PartnerLink } from "@/console/lib/api/tracking";
import { useAccess } from "@/console/lib/context/SessionContext";

/**
 * Partners for one event (port of EventPartnersScreen), shown inside Tracking:
 * a club, community or sponsor gets its own tracking link, and its contact sees
 * the registrations it brings in under Profile › Partner stats in the app.
 * Counts only, never attendees.
 */
export function PartnersPanel({ eventId }: { eventId: string }) {
  const { can } = useAccess(eventId);
  const canEdit = can("event:edit");
  const [partners, setPartners] = useState<PartnerLink[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const { copied, copy } = useCopy();

  const load = useCallback(async () => {
    const res = await getPartnerLinks(eventId);
    if (res.ok) {
      setPartners(res.data);
      setError("");
    } else setError(res.message);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!name.trim() || !email.trim()) {
      setError("Enter the partner name and their contact's email.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await createPartnerLink(eventId, name.trim(), email.trim());
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setName("");
    setEmail("");
    setAdding(false);
    await load();
    void copy(res.data.trackingUrl, res.data.id);
  };

  const remove = async (p: PartnerLink) => {
    if (!window.confirm(`Remove ${p.name}? They stop seeing the stats. Registrations already credited to them stay in Tracking.`)) return;
    const res = await revokePartnerLink(eventId, p.id);
    if (!res.ok) setError(res.message);
    await load();
  };

  const form = (
    <div className="grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto]">
      <Input placeholder="Partner name, e.g. Robotics Club" value={name} onChange={(e) => setName(e.target.value)} />
      <Input type="email" placeholder="Contact's Unifesto email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="flex gap-2">
        <Button onClick={add} disabled={saving}>
          {saving ? "Adding…" : "Add"}
        </Button>
        <Button variant="ghost" onClick={() => setAdding(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <ListGroup
      title="Partners"
      description="Give a club, community or sponsor its own link. Their contact sees how many registrations it brings in, never who."
      action={canEdit && !adding ? <Button size="sm" onClick={() => setAdding(true)}>Add partner</Button> : undefined}
    >
      {error && (
        <div className="p-4">
          <ErrorNotice message={error} />
        </div>
      )}
      {!partners ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <>
          {adding && form}
          {partners.length === 0 && !adding && (
            <EmptyState
              icon={Handshake}
              title="No partners yet"
              description="Each partner gets a tracking link, and registrations through it are credited to them."
              className="py-8"
            />
          )}
          {partners.map((p) => (
            <div key={p.id} className="flex items-center gap-2 pr-3">
              <div className="min-w-0 flex-1">
                <ListRow
                  icon={<Handshake className="h-5 w-5" weight="fill" />}
                  label={p.name}
                  sublabel={p.contact.fullName || p.contact.username || undefined}
                  value={`${p.registrations} reg.`}
                />
              </div>
              <Button size="sm" variant="ghost" onClick={() => void copy(p.trackingUrl, p.id)} aria-label="Copy tracking link">
                {copied === p.id ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
              {canEdit && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void remove(p)}>
                  Remove
                </Button>
              )}
            </div>
          ))}
        </>
      )}
    </ListGroup>
  );
}
