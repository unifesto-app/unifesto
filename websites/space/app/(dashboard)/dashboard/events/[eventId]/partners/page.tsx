"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Copy, Handshake } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListGroup, ListRow } from "@/components/shared/ListGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCopy } from "@/components/tracking/TrackingParts";
import { createPartnerLink, getPartnerLinks, revokePartnerLink, type PartnerLink } from "@/lib/api/tracking";
import { useSession } from "@/lib/context/SessionContext";
import { can } from "@/lib/types/rbac";

/**
 * Partners for one event (port of EventPartnersScreen): a club, community or
 * sponsor gets its own tracking link, and its contact sees the registrations it
 * brings in under Profile › Partner stats in the app. Counts only, never attendees.
 */
export default function EventPartnersPage() {
  const eventId = useParams().eventId as string;
  const { currentRole } = useSession();
  const canEdit = can(currentRole, "event:edit");
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
    <div className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]">
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
    <div className="space-y-6">
      <PageHeader
        title="Partners"
        subtitle="Give a club, community or sponsor its own link. Their contact sees how many registrations it brings in, never who."
        actions={canEdit && !adding ? <Button onClick={() => setAdding(true)}>Add partner</Button> : undefined}
      />
      {error && <ErrorNotice message={error} />}
      {!partners ? (
        <Skeleton className="h-40 w-full" />
      ) : partners.length === 0 && !adding ? (
        <EmptyState
          icon={Handshake}
          title="No partners yet"
          description="Each partner gets a tracking link; registrations through it are credited to them."
        />
      ) : (
        <ListGroup title={`${partners.length} partner${partners.length === 1 ? "" : "s"}`}>
          {adding && form}
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
        </ListGroup>
      )}
    </div>
  );
}
