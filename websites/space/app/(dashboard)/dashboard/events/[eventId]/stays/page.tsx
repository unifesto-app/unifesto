"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Bed, ClipboardText, House, Plus, QrCode } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListGroup, ListRow } from "@/components/shared/ListGroup";
import { HackPage as Page, StatsRow, useResult } from "@/components/hackathon/HackParts";
import { dayLabel, getTeamStays, lookupStayPass, PROPERTY_LABELS, staysBase } from "@/lib/api/stays";
import { useAccess } from "@/lib/context/SessionContext";

/**
 * Unifesto Stay for the event team (port of StaysManageScreen + the pass desk
 * of StayScanScreen): the stays on this event, the request queue, and a Stay
 * Pass lookup for the property desk (type the code or use a handheld scanner).
 */
export default function StaysPage() {
  const eventId = useParams().eventId as string;
  const router = useRouter();
  const { can } = useAccess(eventId);
  const canManage = can("event:manage-attendees");
  const canEdit = can("event:edit");
  const fetcher = useCallback(() => getTeamStays(eventId), [eventId]);
  const { data, error } = useResult(fetcher, "You can't manage stays for this event.");
  const [pass, setPass] = useState("");
  const [looking, setLooking] = useState(false);
  const [passError, setPassError] = useState("");
  const base = staysBase(eventId);

  const lookup = async () => {
    const code = pass.trim().toUpperCase();
    if (!code) return;
    setLooking(true);
    setPassError("");
    const res = await lookupStayPass(eventId, code);
    setLooking(false);
    if (!res.ok) return setPassError(res.message);
    router.push(`${base}/bookings/${res.data.id}`);
  };

  const stays = data?.stays ?? [];
  const totals = stays.reduce(
    (t, s) => ({
      beds: t.beds + s.options.filter((o) => o.isActive).reduce((n, o) => n + o.totalBeds, 0),
      guests: t.guests + s.counts.confirmedGuests,
      checkedIn: t.checkedIn + s.counts.checkedIn,
    }),
    { beds: 0, guests: 0, checkedIn: 0 }
  );

  return (
    <Page
      eventId={eventId}
      back={null}
      title="Stay"
      subtitle="List where attendees can stay. Registered attendees request a bed with their details, you approve, and they get a Stay Pass to show at check-in."
      error={error}
      ready={!!data}
      actions={
        canEdit ? (
          <Button asChild>
            <Link href={`${base}/new`}>
              <Plus className="h-4 w-4" weight="bold" /> Add a stay
            </Link>
          </Button>
        ) : undefined
      }
    >
      {stays.length > 0 && (
        <StatsRow
          stats={[
            { label: "Requests", value: data!.pendingRequests },
            { label: "Guests confirmed", value: totals.guests },
            { label: "Checked in", value: totals.checkedIn },
          ]}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <QrCode className="h-5 w-5" weight="fill" /> Property desk
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void lookup();
            }}
          >
            <Input
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="STAY-XXXXXX"
              autoCapitalize="characters"
              aria-label="Stay Pass code"
              className="font-mono"
            />
            <Button type="submit" disabled={looking || !pass.trim()}>
              {looking ? "Looking up…" : "Open"}
            </Button>
          </form>
          {passError ? (
            <p className="text-sm text-destructive">{passError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Type the code on the guest&apos;s Stay Pass, or scan it with a handheld scanner.</p>
          )}
        </Card>

        {canManage && (
          <ListGroup title="Bookings">
            <ListRow
              icon={<ClipboardText className="h-5 w-5" weight="fill" />}
              label="Requests and guests"
              value={data?.pendingRequests ? `${data.pendingRequests} new` : undefined}
              href={`${base}/bookings`}
            />
          </ListGroup>
        )}
      </div>

      <ListGroup
        title="Stays"
        description={totals.beds === 0 && stays.length ? "Add room or bed options to a stay, then publish it." : undefined}
      >
        {stays.length === 0 && (
          <EmptyState
            icon={House}
            tone={canEdit ? "positive" : "neutral"}
            title="No stays yet"
            description="Add a hostel, hotel or homestay so attendees can request a bed."
          />
        )}
        {stays.map((s) => {
          const beds = s.options.filter((o) => o.isActive).reduce((n, o) => n + o.totalBeds, 0);
          return (
            <ListRow
              key={s.id}
              icon={<Bed className={s.isPublished ? "h-5 w-5" : "h-5 w-5 text-muted-foreground"} weight="fill" />}
              label={s.name}
              sublabel={`${PROPERTY_LABELS[s.propertyType]} · ${dayLabel(s.checkInFrom)} to ${dayLabel(s.checkOutUntil)} · ${beds} bed${beds === 1 ? "" : "s"}${
                s.counts.confirmedGuests ? ` · ${s.counts.confirmedGuests} confirmed` : ""
              }`}
              value={s.isPublished ? (s.counts.pending ? `${s.counts.pending} new` : "Live") : "Hidden"}
              href={canEdit ? `${base}/${s.id}` : undefined}
            />
          );
        })}
      </ListGroup>
    </Page>
  );
}
