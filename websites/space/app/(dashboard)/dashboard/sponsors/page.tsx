"use client";

import { useState } from "react";
import { Handshake } from "@unifesto/unicon/react";
import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RosterTab } from "./RosterTab";
import { TiersTab } from "./TiersTab";
import { EventSponsorsTab } from "./EventSponsorsTab";

/**
 * Sponsors & lead generation (P3). One page, three concerns:
 *   - Roster: the reusable sponsors this space maintains.
 *   - Tiers:  the ladder sponsors are ranked in on public pages.
 *   - Events: attach sponsors to an event, toggle lead capture, read the inbox.
 * Gated by `space:manage-sponsors` (the nav hides it otherwise; the backend
 * enforces it regardless).
 */
export default function SponsorsPage() {
  const spaceId = useSpaceId();
  const [tab, setTab] = useState("roster");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Handshake className="h-4 w-4" weight="fill" />
            Community
          </span>
        }
        title="Sponsors"
        subtitle="Manage your sponsor roster, rank them in tiers, attach them to events and collect leads."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="tiers">Tiers</TabsTrigger>
          <TabsTrigger value="events">Event sponsors &amp; leads</TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="mt-6">
          {spaceId && <RosterTab spaceId={spaceId} />}
        </TabsContent>
        <TabsContent value="tiers" className="mt-6">
          {spaceId && <TiersTab spaceId={spaceId} />}
        </TabsContent>
        <TabsContent value="events" className="mt-6">
          {spaceId && <EventSponsorsTab spaceId={spaceId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
