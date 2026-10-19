"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ClipboardText, FileCsv, MagnifyingGlass } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListGroup, ListRow } from "@/components/shared/ListGroup";
import { Chips, HackPage as Page } from "@/components/hackathon/HackParts";
import {
  dayLabel,
  getStayBookings,
  GUEST_GENDER_LABELS,
  PAYMENT_LABELS,
  STATUS_LABELS,
  staysBase,
  type StayBookingStatus,
  type TeamStayBooking,
} from "@/lib/api/stays";
import { cn } from "@/lib/utils/cn";

type Tab = "requests" | "pay" | "guests" | "all";
const IN_TAB: Record<Tab, StayBookingStatus[] | null> = {
  requests: ["PENDING"],
  pay: ["AWAITING_PAYMENT"],
  guests: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"],
  all: null,
};
const TAB_LABEL: Record<Tab, string> = { requests: "Requests", pay: "To pay", guests: "Guests", all: "All" };

/** RFC 4180 cell. */
const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Stay requests and guests for one event (port of StayBookingsScreen). New
 * requests first; open one to review guests, IDs and answers, then approve.
 */
export default function StayBookingsPage() {
  const eventId = useParams().eventId as string;
  const [rows, setRows] = useState<TeamStayBooking[] | null>(null);
  const [tab, setTab] = useState<Tab>("requests");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const generation = useRef(0);
  const base = staysBase(eventId);

  // Debounced search; a stale response never overwrites a newer one.
  useEffect(() => {
    const t = setTimeout(async () => {
      const gen = ++generation.current;
      const res = await getStayBookings(eventId, { search });
      if (gen !== generation.current) return;
      if (res.ok) {
        setRows(res.data);
        setError("");
      } else {
        setError(res.denied ? "You can't see this event's stay bookings." : res.message);
        setRows((r) => r ?? []);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [eventId, search]);

  const inTab = (t: Tab) => (rows ?? []).filter((b) => !IN_TAB[t] || IN_TAB[t]!.includes(b.status));
  const shown = inTab(tab);

  const exportCsv = () => {
    const guests = inTab("guests");
    const header = ["Pass", "Stay", "Option", "Check in", "Check out", "Guest", "Gender", "Phone", "Email", "Booker", "Room / bed", "Payment", "Amount", "Paid", "Status", "Emergency contact"];
    const lines = guests.flatMap((b) =>
      b.guests.map((g) => [
        b.passCode,
        b.stay.name,
        b.option.name,
        b.checkInDate,
        b.checkOutDate,
        g.name,
        GUEST_GENDER_LABELS[g.gender],
        g.phone ?? "",
        g.email ?? "",
        g.isBooker ? "Yes" : "",
        b.allocation ?? "",
        b.totalAmount ? PAYMENT_LABELS[b.paymentMode] : "Free",
        b.totalAmount,
        b.paymentStatus === "PAID" ? "Yes" : b.totalAmount ? "No" : "",
        STATUS_LABELS[b.status],
        [b.emergencyName, b.emergencyPhone].filter(Boolean).join(" "),
      ])
    );
    const csv = [header, ...lines].map((r) => r.map(cell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `stay-guests-${eventId}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <Page
      eventId={eventId}
      back={{ href: base, label: "Stay" }}
      title="Requests and guests"
      error={error}
      ready={!!rows}
      actions={
        tab === "guests" && shown.length > 0 ? (
          <Button variant="outline" onClick={exportCsv}>
            <FileCsv className="h-4 w-4" /> Export guest list
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-80">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, pass or room" />
        </div>
        <Chips
          options={(Object.keys(TAB_LABEL) as Tab[]).map((t) => ({ value: t, label: `${TAB_LABEL[t]}${inTab(t).length ? ` ${inTab(t).length}` : ""}` }))}
          value={tab}
          onChange={setTab}
        />
      </div>
      <ListGroup>
        {shown.length === 0 && (
          <EmptyState
            icon={ClipboardText}
            title={search.trim() ? "No matches" : tab === "requests" ? "No new requests" : tab === "pay" ? "Nobody is waiting to pay" : "Nothing here yet"}
            description={search.trim() ? "Try a different name, phone, pass or room." : "Bed requests from registered attendees show up here."}
          />
        )}
        {shown.map((b) => {
          const booker = b.guests.find((g) => g.isBooker) ?? b.guests[0];
          const tone =
            b.status === "PENDING" || b.status === "AWAITING_PAYMENT"
              ? "text-warning"
              : b.status === "REJECTED" || b.status === "CANCELLED" || b.status === "EXPIRED"
                ? "text-destructive"
                : "text-success";
          return (
            <ListRow
              key={b.id}
              label={`${booker?.name || b.user.fullName || "Guest"}${b.guestCount > 1 ? ` +${b.guestCount - 1}` : ""}`}
              sublabel={`${b.stay.name} · ${b.option.name} · ${dayLabel(b.checkInDate)} → ${dayLabel(b.checkOutDate)}${b.allocation ? ` · ${b.allocation}` : ""}`}
              value={<span className={cn("text-xs", tone)}>{STATUS_LABELS[b.status]}</span>}
              href={`${base}/bookings/${b.id}`}
            />
          );
        })}
      </ListGroup>
    </Page>
  );
}
