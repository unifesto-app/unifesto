"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  WhatsappLogo,
  Users,
  UsersThree,
  User as UserIcon,
  MagnifyingGlass,
  CircleNotch,
  X,
  PaperPlaneTilt,
  Warning,
  CheckCircle,
  CaretLeft,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listWhatsappTemplates,
  listBroadcastSpaces,
  searchBroadcastUsers,
  sendWhatsappBroadcast,
  type WhatsappTemplate,
  type BroadcastAudience,
  type BroadcastSpace,
  type BroadcastUser,
  type BroadcastResult,
} from "@/lib/api/whatsapp-api";

const NAME_TOKEN = "{name}";
const CONFIRM_PHRASE = "SEND TO ALL";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/* ----------------------------- Audience card ------------------------------ */
function AudienceCard({
  active,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: typeof Users;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors " +
        (active
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:bg-muted/40")
      }
    >
      <Icon
        className={"h-5 w-5 " + (active ? "text-primary" : "text-muted-foreground")}
        weight={active ? "fill" : "regular"}
      />
      <span className="font-medium text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

/* --------------------------- Multi user picker ---------------------------- */
function UserMultiSelect({
  selected,
  onAdd,
  onRemove,
}: {
  selected: BroadcastUser[];
  onAdd: (u: BroadcastUser) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BroadcastUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const { data } = await searchBroadcastUsers(q);
      setResults(data ?? []);
      setLoading(false);
      setOpen(true);
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selectedIds = new Set(selected.map((u) => u.id));

  return (
    <div className="space-y-2">
      <div ref={boxRef} className="relative">
        <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search users by name, username or number…"
          className="pl-9"
        />
        {loading && (
          <CircleNotch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {open && (
          <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card shadow-md">
            {results.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                {loading ? "Searching…" : "No matches."}
              </p>
            ) : (
              results.map((u) => {
                const already = selectedIds.has(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    disabled={already}
                    onClick={() => {
                      onAdd(u);
                      setQuery("");
                      setResults([]);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted/60 disabled:opacity-50"
                  >
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{u.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {u.username ? `@${u.username} · ` : ""}
                        {u.mobileMasked}
                      </span>
                    </span>
                    {already && <span className="text-xs text-muted-foreground">Added</span>}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((u) => (
            <span
              key={u.id}
              className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm"
            >
              {u.name}
              <button
                type="button"
                onClick={() => onRemove(u.id)}
                className="rounded-full p-0.5 hover:bg-background"
                aria-label={`Remove ${u.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * WhatsApp Blast — send a pre-approved template to a chosen audience: everyone
 * in the app, the members of one Space, or a hand-picked set of users. Reaching
 * people cold requires an approved template (WhatsApp's 24h rule), so this is a
 * template picker, not a free-text composer. Backed by `/admin/whatsapp/broadcast`.
 */
export default function WhatsAppBroadcastPage() {
  const [audience, setAudience] = useState<BroadcastAudience>("SPACE");

  // Spaces
  const [spaces, setSpaces] = useState<BroadcastSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [spaceId, setSpaceId] = useState("");

  // Users
  const [selectedUsers, setSelectedUsers] = useState<BroadcastUser[]>([]);

  // Templates
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState("");
  const [templateKey, setTemplateKey] = useState(""); // `name::lang`
  const [params, setParams] = useState<string[]>([]);

  const [confirmText, setConfirmText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError("");
    const { data, error } = await listWhatsappTemplates();
    if (error) setTemplatesError(error.message || "Could not load templates.");
    setTemplates(data ?? []);
    setTemplatesLoading(false);
  }, []);

  const loadSpaces = useCallback(async () => {
    setSpacesLoading(true);
    const { data } = await listBroadcastSpaces();
    setSpaces(data ?? []);
    setSpacesLoading(false);
  }, []);

  useEffect(() => {
    loadTemplates();
    loadSpaces();
  }, [loadTemplates, loadSpaces]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => `${t.name}::${t.language}` === templateKey) ?? null,
    [templates, templateKey]
  );

  // Resize the parameter inputs to the selected template's placeholder count,
  // preserving anything already typed.
  useEffect(() => {
    const n = selectedTemplate?.bodyParamCount ?? 0;
    setParams((prev) => {
      const next = Array.from({ length: n }, (_, i) => prev[i] ?? "");
      return next;
    });
  }, [selectedTemplate]);

  const selectedSpace = spaces.find((s) => s.id === spaceId) ?? null;

  const audienceReady =
    (audience === "ALL") ||
    (audience === "SPACE" && !!spaceId) ||
    (audience === "USER" && selectedUsers.length > 0);

  const paramsReady = params.every((p) => p.trim().length > 0);
  const confirmReady = audience !== "ALL" || confirmText.trim() === CONFIRM_PHRASE;

  const canSend =
    !!selectedTemplate && audienceReady && paramsReady && confirmReady && !sending;

  const recipientHint = useMemo(() => {
    if (audience === "ALL") return "every user in the app with a mobile number";
    if (audience === "SPACE")
      return selectedSpace
        ? `${selectedSpace.memberCount} member${selectedSpace.memberCount === 1 ? "" : "s"} of ${selectedSpace.name}`
        : "the members of the chosen space";
    return `${selectedUsers.length} selected user${selectedUsers.length === 1 ? "" : "s"}`;
  }, [audience, selectedSpace, selectedUsers.length]);

  const handleSend = async () => {
    if (!selectedTemplate) return;
    setSending(true);
    setError("");
    setResult(null);
    const { data, error } = await sendWhatsappBroadcast({
      audience,
      spaceId: audience === "SPACE" ? spaceId : undefined,
      userIds: audience === "USER" ? selectedUsers.map((u) => u.id) : undefined,
      templateName: selectedTemplate.name,
      languageCode: selectedTemplate.language,
      bodyParams: params.map((p) => p.trim()),
    });
    if (error) {
      setError(error.message || "Could not start the broadcast.");
    } else {
      setResult(data);
      setConfirmText("");
    }
    setSending(false);
  };

  /* ------------------------------ Success view ---------------------------- */
  if (result) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500" weight="fill" />
            <h2 className="text-xl font-semibold text-foreground">Broadcast started</h2>
            <p className="text-sm text-muted-foreground">
              Sending <span className="font-medium text-foreground">{selectedTemplate?.name}</span>{" "}
              to <span className="font-medium text-foreground">{result.recipientCount}</span>{" "}
              recipient{result.recipientCount === 1 ? "" : "s"}. Delivery runs in the
              background — individual sends appear in Meta&apos;s dashboards.
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                onClick={() => {
                  setResult(null);
                  setConfirmText("");
                }}
              >
                Send another
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard/whatsapp">Back to inbox</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ------------------------------- Composer ------------------------------- */
  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp Blast"
        subtitle="Send a pre-approved template to everyone, a space's members, or specific users"
        actions={
          <Button variant="ghost" asChild>
            <Link href="/dashboard/whatsapp">
              <CaretLeft className="h-4 w-4" /> Inbox
            </Link>
          </Button>
        }
      />

      {error && <ErrorNotice message={error} />}

      {/* 1. Audience */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Who receives it</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <AudienceCard
              active={audience === "SPACE"}
              icon={UsersThree}
              title="Space members"
              description="Everyone with a role in one space"
              onClick={() => setAudience("SPACE")}
            />
            <AudienceCard
              active={audience === "USER"}
              icon={UserIcon}
              title="Specific users"
              description="Hand-pick one or more people"
              onClick={() => setAudience("USER")}
            />
            <AudienceCard
              active={audience === "ALL"}
              icon={Users}
              title="Everyone"
              description="All app users with a number"
              onClick={() => setAudience("ALL")}
            />
          </div>

          {audience === "SPACE" && (
            <div className="space-y-1.5">
              <Label>Space</Label>
              <select
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
                disabled={spacesLoading}
                className={selectClass}
              >
                <option value="" disabled>
                  {spacesLoading ? "Loading spaces…" : "Select a space"}
                </option>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.memberCount} member{s.memberCount === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {audience === "USER" && (
            <UserMultiSelect
              selected={selectedUsers}
              onAdd={(u) => setSelectedUsers((prev) => [...prev, u])}
              onRemove={(id) => setSelectedUsers((prev) => prev.filter((u) => u.id !== id))}
            />
          )}

          {audience === "ALL" && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <Warning className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This messages <strong>every user in the app</strong> that has a mobile
                number. It cannot be undone once started. Use a template classified as
                Marketing and only for opted-in recipients.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Template */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">2 · Message template</CardTitle>
          <Button variant="ghost" size="sm" onClick={loadTemplates} disabled={templatesLoading}>
            <ArrowClockwise className="h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {templatesError && (
            <p className="text-sm text-destructive">
              {templatesError}{" "}
              <button type="button" className="underline" onClick={loadTemplates}>
                Retry
              </button>
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Template</Label>
            <select
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              disabled={templatesLoading}
              className={selectClass}
            >
              <option value="" disabled>
                {templatesLoading
                  ? "Loading templates…"
                  : templates.length === 0
                    ? "No approved templates"
                    : "Select a template"}
              </option>
              {templates.map((t) => (
                <option key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                  {t.name} ({t.language}) · {t.category}
                </option>
              ))}
            </select>
          </div>

          {selectedTemplate && (
            <>
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                {selectedTemplate.bodyText && (
                  <p className="whitespace-pre-wrap text-foreground">
                    “{selectedTemplate.bodyText}”
                  </p>
                )}
                {selectedTemplate.needsMediaHeader && (
                  <p className="mt-2 flex items-center gap-1.5 text-destructive">
                    <Warning className="h-4 w-4" /> This template has a media header, which
                    this sender can&apos;t fill — it may fail.
                  </p>
                )}
              </div>

              {params.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Fill the template&apos;s variables. Use{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{NAME_TOKEN}</code>{" "}
                    to insert each recipient&apos;s own name.
                  </p>
                  {params.map((value, i) => (
                    <div key={i} className="space-y-1.5">
                      <Label>Variable {`{{${i + 1}}}`}</Label>
                      <div className="flex gap-2">
                        <Input
                          value={value}
                          onChange={(e) =>
                            setParams((prev) =>
                              prev.map((p, idx) => (idx === i ? e.target.value : p))
                            )
                          }
                          placeholder={i === 0 ? "e.g. {name}" : "Enter a value"}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() =>
                            setParams((prev) =>
                              prev.map((p, idx) => (idx === i ? NAME_TOKEN : p))
                            )
                          }
                        >
                          Insert name
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 3. Review & send */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3 · Review &amp; send</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline" className="gap-1">
              <WhatsappLogo className="h-3.5 w-3.5" />
              {selectedTemplate ? selectedTemplate.name : "No template"}
            </Badge>
            <span className="text-muted-foreground">→ {recipientHint}</span>
          </div>

          {audience === "ALL" && (
            <div className="space-y-1.5">
              <Label>
                Type <span className="font-mono">{CONFIRM_PHRASE}</span> to confirm the
                app-wide blast
              </Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_PHRASE}
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSend} disabled={!canSend}>
              <PaperPlaneTilt className="h-4 w-4" />
              {sending ? "Starting…" : "Start broadcast"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
