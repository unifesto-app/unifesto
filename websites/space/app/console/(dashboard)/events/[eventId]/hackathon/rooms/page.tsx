"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { DoorOpen, Plus } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { HackPage, Notice, hackBase, useResult } from "@/console/components/hackathon/HackParts";
import { autoAllocateRooms, getRooms } from "@/console/lib/api/hackathon";

/**
 * Rooms at the venue and how full they are (port of HackathonRoomsScreen).
 * Auto-allocate fills free places with roomless teams in Team ID order.
 */
export default function HackathonRoomsPage() {
  const eventId = useParams().eventId as string;
  const fetcher = useCallback(() => getRooms(eventId), [eventId]);
  const { data, setData, error, setError } = useResult(fetcher);
  const [allocating, setAllocating] = useState(false);
  const [notice, setNotice] = useState("");
  const base = `${hackBase(eventId)}/rooms`;

  const rooms = data?.rooms ?? [];
  const unallocated = data?.unallocated ?? 0;
  const free = rooms.reduce((s, r) => s + Math.max(0, r.capacity - r.occupied), 0);

  const allocate = async () => {
    if (
      !window.confirm(
        `Allocate ${unallocated} team${unallocated === 1 ? "" : "s"}? Teams without a room fill the ${free} free place${
          free === 1 ? "" : "s"
        }, room by room in Team ID order. Teams already in a room stay put. Each team is notified of its room.`
      )
    )
      return;
    setAllocating(true);
    const res = await autoAllocateRooms(eventId);
    setAllocating(false);
    if (!res.ok) return setError(res.message);
    setData((d) => (d ? { ...d, rooms: res.data.rooms, unallocated: res.data.unallocated } : d));
    setNotice(
      res.data.unplaced
        ? `${res.data.allocated} placed. ${res.data.unplaced} didn't fit: add a room or raise a capacity, then allocate again.`
        : `${res.data.allocated} team${res.data.allocated === 1 ? "" : "s"} placed.`
    );
  };

  return (
    <HackPage
      eventId={eventId}
      title="Rooms"
      error={error}
      ready={!!data}
      actions={
        <Button asChild>
          <Link href={`${base}/new`}>
            <Plus className="h-4 w-4" weight="bold" /> Add room
          </Link>
        </Button>
      }
    >
      <Notice message={notice} />
      {rooms.length === 0 ? (
        <EmptyState icon={DoorOpen} title="No rooms yet" description="Add the rooms teams will work in, with how many teams each one fits." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-sm text-foreground">
                {unallocated ? `${unallocated} team${unallocated === 1 ? "" : "s"} without a room` : "Every team has a room"}
              </p>
              <p className="text-xs text-muted-foreground">
                {free} free place{free === 1 ? "" : "s"} across {rooms.length} room{rooms.length === 1 ? "" : "s"}
              </p>
            </div>
            {unallocated > 0 && (
              <Button variant="outline" onClick={allocate} disabled={allocating || free === 0}>
                {allocating ? "Allocating…" : "Auto-allocate"}
              </Button>
            )}
          </div>
          {unallocated > 0 && free === 0 && <p className="text-sm text-warning">Every room is full. Add a room or raise a capacity.</p>}
          <ListGroup title="Rooms">
            {rooms.map((r) => (
              <ListRow key={r.id} label={r.location ? `${r.name} · ${r.location}` : r.name} value={`${r.occupied}/${r.capacity}`} href={`${base}/${r.id}`} />
            ))}
          </ListGroup>
        </>
      )}
    </HackPage>
  );
}
