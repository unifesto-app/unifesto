"use client";

import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ShareNetwork,
  MagnifyingGlass,
  Plus,
  Trash,
  Crown,
  SignOut,
  ArrowsLeftRight,
  Check,
  X,
} from "@unifesto/unicon/react";
import {
  getCoHosts,
  addCoHost,
  removeCoHost,
  requestOwnershipTransfer,
  acceptOwnershipTransfer,
  declineOwnershipTransfer,
  cancelOwnershipTransfer,
  type CoHostsResponse,
} from "@/lib/api/events-api";
import { searchSpaces, type SpaceSearchResult } from "@/lib/api/spaces-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function SpaceAvatar({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className="h-9 w-9 rounded-md object-cover" />
    );
  }
  return (
    <div className="grid h-9 w-9 place-items-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
      {name.substring(0, 2).toUpperCase()}
    </div>
  );
}

export default function EventCoHostingPage() {
  const params = useParams();
  const spaceId = useSpaceId();
  const eventId = params.eventId as string;

  const [data, setData] = useState<CoHostsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Invite search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const load = useCallback(async () => {
    const { data, error } = await getCoHosts(eventId);
    if (error) setError(error.message);
    else setData(data);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced space search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await searchSpaces(q);
      if (seq !== searchSeq.current) return; // a newer search superseded this
      setResults(data ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const isOwner = data != null && data.owner.id === spaceId;
  const coHostIds = new Set((data?.coHosts ?? []).map((c) => c.space.id));

  // A pending ownership offer, if any. Only one can be open at a time. The
  // current space is either the host that proposed it or the co-host being
  // offered ownership — each sees different actions.
  const pending = data?.pendingTransfer ?? null;
  const iAmReceiver = pending != null && pending.toSpace.id === spaceId;
  const iAmProposingHost = pending != null && pending.fromSpace.id === spaceId;

  const invite = async (target: SpaceSearchResult) => {
    setInviting(target.id);
    setError("");
    const { error } = await addCoHost(eventId, target.id);
    setInviting(null);
    if (error) {
      setError(error.message);
      return;
    }
    setQuery("");
    setResults([]);
    await load();
  };

  const remove = async (targetSpaceId: string, name: string) => {
    if (!confirm(`Remove ${name} as a co-host?`)) return;
    setError("");
    const { error } = await removeCoHost(eventId, targetSpaceId);
    if (error) setError(error.message);
    else await load();
  };

  // Ownership transfer. The host proposes; the receiving co-host accepts or
  // declines. Payouts and plan gating follow ownership, so we spell that out.
  const makeHost = async (targetSpaceId: string, name: string) => {
    const note = prompt(
      `Offer ownership of this event to ${name}?\n\n` +
        `They must accept before it takes effect. Once accepted, this event's ` +
        `payouts and management move to ${name}, and your space is removed.\n\n` +
        `Optional note to send with the offer:`
    );
    if (note === null) return; // dialog cancelled
    setError("");
    const { error } = await requestOwnershipTransfer(
      eventId,
      targetSpaceId,
      note.trim() || undefined
    );
    if (error) setError(error.message);
    else await load();
  };

  const acceptTransfer = async () => {
    if (
      !confirm(
        "Accept ownership of this event? Its payouts and management will move to your space."
      )
    )
      return;
    setError("");
    const { error } = await acceptOwnershipTransfer(eventId);
    if (error) setError(error.message);
    else await load();
  };

  const declineTransfer = async () => {
    if (!confirm("Decline this ownership offer?")) return;
    setError("");
    const { error } = await declineOwnershipTransfer(eventId);
    if (error) setError(error.message);
    else await load();
  };

  const cancelTransfer = async () => {
    if (!confirm("Cancel the pending ownership offer?")) return;
    setError("");
    const { error } = await cancelOwnershipTransfer(eventId);
    if (error) setError(error.message);
    else await load();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Co-Hosting"
        subtitle="Invite other spaces to co-host this event and share management access"
      />

      {error && <ErrorNotice message={error} />}

      {/* Pending ownership transfer — one open at a time. The receiving co-host
          accepts/declines; the proposing host can rescind; anyone else sees an
          informational note. */}
      {pending && (
        <Card className="border-primary/30 bg-primary-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowsLeftRight className="h-4 w-4 text-primary" weight="bold" />
              {iAmReceiver
                ? `${pending.fromSpace.name} wants to make you the host`
                : iAmProposingHost
                  ? `Waiting for ${pending.toSpace.name} to accept`
                  : `Ownership transfer pending`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {iAmReceiver ? (
                <>
                  Accepting moves this event&apos;s payouts and management to your
                  space. {pending.fromSpace.name} will be removed as host.
                </>
              ) : iAmProposingHost ? (
                <>
                  You offered ownership to{" "}
                  <span className="font-medium text-foreground">
                    {pending.toSpace.name}
                  </span>
                  . It takes effect once they accept; until then nothing has
                  changed.
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">
                    {pending.fromSpace.name}
                  </span>{" "}
                  has offered ownership of this event to{" "}
                  <span className="font-medium text-foreground">
                    {pending.toSpace.name}
                  </span>
                  .
                </>
              )}
            </p>
            {pending.reason && (
              <p className="rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground">
                &ldquo;{pending.reason}&rdquo;
              </p>
            )}
            {iAmReceiver && (
              <div className="flex gap-2">
                <Button size="sm" onClick={acceptTransfer}>
                  <Check className="h-4 w-4" weight="bold" />
                  Accept ownership
                </Button>
                <Button variant="secondary" size="sm" onClick={declineTransfer}>
                  <X className="h-4 w-4" />
                  Decline
                </Button>
              </div>
            )}
            {iAmProposingHost && (
              <Button variant="secondary" size="sm" onClick={cancelTransfer}>
                <X className="h-4 w-4" />
                Cancel offer
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invite — host space only, hidden while a transfer is in flight */}
      {isOwner && !pending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite a co-host</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Each co-host space&apos;s admins and curators get full management access to this
              event, and it appears in their own event list.
            </p>
            <div className="relative">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search spaces by name…"
                className="pl-9"
              />
            </div>

            {query.trim().length >= 2 && (
              <div className="rounded-md border border-border">
                {searching && results.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    Searching…
                  </p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">
                    No spaces found.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {results.map((s) => {
                      const already =
                        s.id === data?.owner.id || coHostIds.has(s.id);
                      return (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-3 px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <SpaceAvatar name={s.name} logoUrl={s.logo_url} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {s.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                @{s.slug}
                              </p>
                            </div>
                          </div>
                          {already ? (
                            <Badge variant="neutral">
                              {s.id === data?.owner.id ? "Host" : "Added"}
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => invite(s)}
                              disabled={inviting === s.id}
                            >
                              <Plus className="h-4 w-4" weight="bold" />
                              Invite
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Current hosts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hosts</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y divide-border">
            {data && (
              <li className="flex items-center justify-between gap-3 px-6 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <SpaceAvatar
                    name={data.owner.name}
                    logoUrl={data.owner.logoUrl}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {data.owner.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{data.owner.slug}
                    </p>
                  </div>
                </div>
                <Badge variant="brand">
                  <Crown className="mr-1 h-3 w-3" weight="fill" />
                  Host
                </Badge>
              </li>
            )}

            {(data?.coHosts ?? []).map((c) => {
              // The host can remove anyone; a co-host can remove itself (leave).
              const canRemove = isOwner || c.space.id === spaceId;
              return (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-6 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <SpaceAvatar name={c.space.name} logoUrl={c.space.logoUrl} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {c.space.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        @{c.space.slug}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">Co-host</Badge>
                    {isOwner && !pending && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => makeHost(c.space.id, c.space.name)}
                        title="Transfer ownership to this co-host"
                      >
                        <ArrowsLeftRight className="h-4 w-4" />
                        Make host
                      </Button>
                    )}
                    {canRemove && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(c.space.id, c.space.name)}
                      >
                        {c.space.id === spaceId ? (
                          <>
                            <SignOut className="h-4 w-4" />
                            Leave
                          </>
                        ) : (
                          <Trash className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {data && data.coHosts.length === 0 && (
            <EmptyState
              icon={ShareNetwork}
              title="No co-hosts yet"
              description={
                isOwner
                  ? "Invite another space above to share management of this event."
                  : "This event has no co-hosts."
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
