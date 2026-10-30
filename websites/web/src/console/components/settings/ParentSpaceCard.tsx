"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle } from "@unifesto/unicon/react";
import {
  createSubSpaceRequest,
  getSpace,
  searchSpaces,
  type SpaceSearchResult,
  type SubSpaceRequestType,
} from "@/console/lib/api/spaces-api";
import type { SpaceWithHierarchy } from "@/console/lib/types/rbac";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Textarea } from "@/console/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/console/components/ui/card";

type Choice = "JOIN" | "CONVERT_TO_SUPER" | "CONVERT_TO_REGULAR" | "REMOVE_PARENT";

/**
 * B9 / D5: ask Unifesto to move this space in the hierarchy (join a parent,
 * become one, or leave one). Unifesto reviews it as an Assist case.
 */
export function ParentSpaceCard({ space }: { space: SpaceWithHierarchy }) {
  const isSuper = space.spaceKind === "SUPER";
  const parentId = space.parentSpaceId ?? null;
  const choices: { value: Choice; label: string }[] = parentId
    ? [{ value: "REMOVE_PARENT", label: "Leave the parent space" }]
    : isSuper
      ? [{ value: "CONVERT_TO_REGULAR", label: "Make it a regular space" }]
      : [
          { value: "JOIN", label: "Join a parent space" },
          { value: "CONVERT_TO_SUPER", label: "Make it a parent space" },
        ];

  const [choice, setChoice] = useState<Choice>(choices[0].value);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpaceSearchResult[]>([]);
  const [parent, setParent] = useState<SpaceSearchResult | null>(null);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (choice !== "JOIN" || q.length < 2) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const { data } = await searchSpaces(q);
      if (mine === seq.current) setResults((data ?? []).filter((s) => s.id !== space.id));
    }, 300);
    return () => clearTimeout(t);
  }, [query, choice, space.id]);

  const send = async () => {
    setError("");
    let payload: { requestType: SubSpaceRequestType; targetSpaceId: string; subSpaceId?: string };
    if (choice === "JOIN") {
      if (!parent) return setError("Pick the parent space first.");
      setSending(true);
      const { data: target } = await getSpace(parent.id);
      payload = {
        requestType: target?.spaceKind === "SUPER" ? "JOIN_SUPER" : "CONVERT_AND_JOIN",
        targetSpaceId: parent.id,
        subSpaceId: space.id,
      };
    } else if (choice === "REMOVE_PARENT") {
      payload = { requestType: "REMOVE_PARENT", targetSpaceId: parentId!, subSpaceId: space.id };
    } else {
      payload = { requestType: choice, targetSpaceId: space.id };
    }
    setSending(true);
    const { error } = await createSubSpaceRequest({ ...payload, reason: reason.trim() || undefined });
    setSending(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parent space</CardTitle>
        <CardDescription>
          A parent space groups others, like a college over its clubs. Unifesto reviews every change.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sent ? (
          <div className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
            <CheckCircle className="h-4 w-4" weight="fill" />
            Sent to Unifesto. Their reply comes to My help in the app and by email.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {choices.map((c) => (
                <Button
                  key={c.value}
                  type="button"
                  variant={choice === c.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setChoice(c.value)}
                >
                  {c.label}
                </Button>
              ))}
            </div>

            {choice === "JOIN" && (
              <div className="space-y-4">
                <Label htmlFor="parent-search">Parent space</Label>
                {parent ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{parent.name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setParent(null)}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      id="parent-search"
                      placeholder="Search spaces by name"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {results.length > 0 && (
                      <ul className="divide-y divide-border rounded-md border border-border">
                        {results.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              className="w-full truncate px-3 py-2 text-left text-sm hover:bg-muted"
                              onClick={() => {
                                setParent(s);
                                setQuery("");
                              }}
                            >
                              {s.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="hierarchy-reason">Why (optional)</Label>
              <Textarea
                id="hierarchy-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {error && <ErrorNotice message={error} />}
            <Button type="button" onClick={send} disabled={sending}>
              {sending ? "Sending..." : "Send to Unifesto"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
