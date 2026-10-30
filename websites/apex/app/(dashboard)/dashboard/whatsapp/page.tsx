"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  WhatsappLogo,
  MagnifyingGlass,
  ChatCircleDots,
  Clock,
  CaretLeft,
  PaperPlaneTilt,
  ArrowClockwise,
  Warning,
  Plus,
  X,
  FileArrowDown,
  Paperclip,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getWhatsappStats,
  listWhatsappConversations,
  getWhatsappConversation,
  replyToWhatsappConversation,
  sendWhatsappMedia,
  convertWhatsappToCase,
  initiateWhatsappConversation,
  listWhatsappTemplates,
  conversationName,
  messagePreview,
  type WhatsappConversation,
  type WhatsappMessage,
  type WhatsappInboxStats,
  type WhatsappTemplate,
} from "@/lib/api/whatsapp-api";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/* --------------------------- Media attachment ----------------------------- */
/**
 * Renders an inbound attachment inline, choosing the element from the message
 * `type` (Meta's kind). The bytes were copied to our S3, so `mediaUrl` is a
 * plain embeddable URL. Anything without a URL renders nothing (the bubble
 * falls back to its `mediaNote` text).
 */
function MediaAttachment({ m }: { m: WhatsappMessage }) {
  if (!m.mediaUrl) return null;

  if (m.type === "image" || m.type === "sticker") {
    return (
      <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={m.mediaUrl}
          alt={m.body || "WhatsApp image"}
          className={
            "mb-1 w-auto max-w-full rounded-lg object-cover " +
            (m.type === "sticker" ? "max-h-32" : "max-h-72")
          }
          loading="lazy"
        />
      </a>
    );
  }

  if (m.type === "video") {
    return (
      <video
        src={m.mediaUrl}
        controls
        preload="metadata"
        className="mb-1 max-h-72 w-auto max-w-full rounded-lg"
      />
    );
  }

  if (m.type === "audio") {
    return <audio src={m.mediaUrl} controls preload="metadata" className="mb-1 w-full min-w-[15rem]" />;
  }

  // Document (or any other kind we copied): a download card. The label prefers
  // the filename/caption we captured in `body`, then the note, then a default.
  const label = m.body || m.mediaNote?.replace(/^\[document\]\s*/, "").trim() || "Download file";
  return (
    <a
      href={m.mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      download
      className="mb-1 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm underline"
    >
      <FileArrowDown className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  );
}

/* ------------------------------- Thread bubble ---------------------------- */
function MessageBubble({ m, picked, onPick }: { m: WhatsappMessage; picked?: boolean; onPick?: () => void }) {
  const outbound = m.direction === "OUTBOUND";
  const failed = m.status === "failed";
  return (
    <div className={outbound ? "flex justify-end" : "flex justify-start"}>
      <div
        role={onPick ? "checkbox" : undefined}
        aria-checked={onPick ? !!picked : undefined}
        tabIndex={onPick ? 0 : undefined}
        onClick={onPick}
        onKeyDown={onPick ? (e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), onPick()) : undefined}
        className={
          (onPick ? "cursor-pointer " : "") +
          (picked ? "ring-2 ring-primary ring-offset-2 ring-offset-background " : "") +
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm " +
          (outbound
            ? failed
              ? "bg-destructive/10 text-foreground"
              : "bg-primary text-primary-foreground"
            : "bg-muted text-foreground")
        }
      >
        <MediaAttachment m={m} />

        {/* Caption / text body. Documents already show their name on the card. */}
        {m.body && m.type !== "document" && (
          <p className="whitespace-pre-wrap break-words">{m.body}</p>
        )}

        {/* Nothing else to show (no caption, no embed) → surface the note, e.g.
            an unsupported message or a media copy that failed. */}
        {!m.body && !m.mediaUrl && (
          <p className="italic opacity-80">{m.mediaNote || `[${m.type}]`}</p>
        )}

        {/* Secondary note alongside a caption (e.g. location coordinates). */}
        {m.mediaNote && m.body && !m.mediaUrl && (
          <p className="mt-1 text-xs italic opacity-80">{m.mediaNote}</p>
        )}
        <div
          className={
            "mt-1 flex items-center gap-1 text-[11px] " +
            (outbound && !failed ? "text-primary-foreground/70" : "text-muted-foreground")
          }
        >
          <span>{clockTime(m.createdAt)}</span>
          {outbound && m.status && !failed && <span>· {m.status}</span>}
          {failed && (
            <span className="flex items-center gap-1 font-medium text-destructive">
              <Warning className="h-3 w-3" /> failed
            </span>
          )}
        </div>
        {failed && m.errorText && (
          <p className="mt-1 text-[11px] text-destructive">{m.errorText}</p>
        )}
      </div>
    </div>
  );
}

/**
 * WhatsApp — the admin inbox for the Business number. Lists the conversations
 * the number received (persisted from the Meta webhook) and lets an admin reply
 * within Meta's 24-hour customer-service window. Backed by `/admin/whatsapp`.
 */
export default function WhatsAppInboxPage() {
  const [conversations, setConversations] = useState<WhatsappConversation[]>([]);
  const [stats, setStats] = useState<WhatsappInboxStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<WhatsappConversation | null>(null);
  // D26: messages picked to copy into an Assist case.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // "Start a new conversation" (template) form.
  const [showNew, setShowNew] = useState(false);
  const [newTo, setNewTo] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [newLang, setNewLang] = useState("en");
  const [newParams, setNewParams] = useState("");
  const [starting, setStarting] = useState(false);
  const [newError, setNewError] = useState("");
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState("");

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const loadStats = useCallback(async () => {
    const { data } = await getWhatsappStats();
    if (data) setStats(data);
  }, []);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError("");
    const { data, error } = await listWhatsappTemplates();
    if (error) {
      setTemplatesError(error.message || "Could not load templates.");
      setTemplates([]);
    } else {
      setTemplates(data ?? []);
    }
    setTemplatesLoading(false);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await listWhatsappConversations({
      search: search.trim() || undefined,
      limit: 50,
    });
    if (error) {
      setError(error.message || "Could not load conversations.");
      setConversations([]);
    } else {
      setConversations(data?.conversations ?? []);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const openConversation = useCallback(async (id: string) => {
    setDetailLoading(true);
    setError("");
    const { data, error } = await getWhatsappConversation(id);
    if (error) {
      setError(error.message || "Could not open conversation.");
    } else {
      setSelected(data);
      // Pre-pick what's unanswered: the inbound messages after our last reply.
      const msgs = data?.messages ?? [];
      const lastOut = msgs.map((m) => m.direction).lastIndexOf("OUTBOUND");
      setPicked(new Set(msgs.slice(lastOut + 1).filter((m) => m.direction === "INBOUND").map((m) => m.id)));
    }
    setDetailLoading(false);
  }, []);

  const togglePick = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const handleConvert = async () => {
    if (!selected || !picked.size) return;
    setConverting(true);
    setError("");
    const { data, error } = await convertWhatsappToCase(selected.id, [...picked]);
    if (error || !data) setError(error?.message || "Could not open the case.");
    else setSelected((c) => c && { ...c, caseId: data.caseId });
    setConverting(false);
  };

  // Keep the thread scrolled to the newest message.
  useEffect(() => {
    if (selected?.messages) {
      threadEndRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [selected?.messages]);

  const handleSend = async () => {
    const body = replyText.trim();
    // Nothing to send unless there's text or an attachment.
    if (!selected || (!body && !attachment)) return;
    setSending(true);
    setError("");
    // An attachment sends as media (with the text as its caption); otherwise a
    // plain text reply.
    const { error } = attachment
      ? await sendWhatsappMedia(selected.id, attachment, body || undefined)
      : await replyToWhatsappConversation(selected.id, body);
    if (error) {
      setError(error.message || "Could not send reply.");
    } else {
      setReplyText("");
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await Promise.all([openConversation(selected.id), loadList(), loadStats()]);
    }
    setSending(false);
  };

  const handleStartConversation = async () => {
    const to = newTo.trim();
    const templateName = newTemplate.trim();
    if (!to || !templateName) {
      setNewError("A recipient number and a template name are both required.");
      return;
    }
    setStarting(true);
    setNewError("");
    const bodyParams = newParams
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const { data, error } = await initiateWhatsappConversation({
      to,
      templateName,
      languageCode: newLang.trim() || undefined,
      bodyParams: bodyParams.length ? bodyParams : undefined,
    });
    if (error) {
      setNewError(error.message || "Could not start the conversation.");
    } else {
      setShowNew(false);
      setNewTo("");
      setNewTemplate("");
      setNewLang("en");
      setNewParams("");
      await Promise.all([loadList(), loadStats()]);
      if (data?.conversationId) await openConversation(data.conversationId);
    }
    setStarting(false);
  };

  const statCards = useMemo(
    () => [
      {
        title: "Conversations",
        value: stats?.conversations ?? 0,
        hint: "People who messaged the number",
        icon: ChatCircleDots,
        tone: "neutral" as const,
      },
      {
        title: "Unread",
        value: stats?.unread ?? 0,
        hint: "Inbound messages not yet opened",
        icon: WhatsappLogo,
        tone: "brand" as const,
      },
      {
        title: "Open reply windows",
        value: stats?.openWindows ?? 0,
        hint: "Messaged us within 24h — repliable now",
        icon: Clock,
        tone: "success" as const,
      },
    ],
    [stats]
  );

  const selectedTemplate = useMemo(
    () =>
      templates.find(
        (t) => t.name === newTemplate && t.language === newLang
      ) ?? null,
    [templates, newTemplate, newLang]
  );

  /* ----------------------------- Detail view ----------------------------- */
  if (selected) {
    const canReply = selected.replyWindowOpen;
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit"
          onClick={() => {
            setSelected(null);
            setReplyText("");
            setAttachment(null);
          }}
        >
          <CaretLeft className="h-4 w-4" /> Back to inbox
        </Button>

        {error && <ErrorNotice message={error} />}

        <Card className="mx-auto flex h-[70vh] max-w-3xl flex-col">
          <CardHeader className="gap-1 border-b border-border">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg">
                {conversationName(selected)}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={canReply ? "success" : "outline"}>
                  {canReply ? "Reply window open" : "Window closed"}
                </Badge>
                {selected.caseId ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/dashboard/support?case=${selected.caseId}`}>Open case</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={!picked.size || converting} onClick={handleConvert}>
                    {converting ? "Opening…" : `Convert to case (${picked.size})`}
                  </Button>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              +{selected.waId}
              {selected.lastInboundAt
                ? ` · last messaged ${timeAgo(selected.lastInboundAt)}`
                : ""}
              {!selected.caseId && " · click messages to pick what goes into the case"}
            </p>
          </CardHeader>

          {/* Thread */}
          <CardContent className="flex-1 space-y-4 overflow-y-auto py-5">
            {detailLoading || !selected.messages ? (
              <div className="space-y-4">
                <Skeleton className="h-14 w-2/3" />
                <Skeleton className="ml-auto h-14 w-2/3" />
                <Skeleton className="h-14 w-1/2" />
              </div>
            ) : selected.messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No messages in this conversation.
              </p>
            ) : (
              selected.messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  m={m}
                  picked={!selected.caseId && picked.has(m.id)}
                  onPick={selected.caseId ? undefined : () => togglePick(m.id)}
                />
              ))
            )}
            <div ref={threadEndRef} />
          </CardContent>

          {/* Composer */}
          <div className="border-t border-border p-4">
            {canReply ? (
              <div className="space-y-2">
                {/* Selected attachment chip */}
                {attachment && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {attachment.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {(attachment.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachment(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="shrink-0 rounded p-0.5 hover:bg-background"
                      aria-label="Remove attachment"
                      disabled={sending}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > 64 * 1024 * 1024) {
                        setError("That file is over the 64 MB limit.");
                        e.target.value = "";
                        return;
                      }
                      setError("");
                      setAttachment(f);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                    aria-label="Attach a file"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={
                      attachment
                        ? "Add a caption…  (optional)"
                        : "Type a reply…  (⌘/Ctrl + Enter to send)"
                    }
                    rows={2}
                    className="resize-none"
                    disabled={sending}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={sending || (!replyText.trim() && !attachment)}
                    className="shrink-0"
                  >
                    <PaperPlaneTilt className="h-4 w-4" />
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                <Warning className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  The 24-hour reply window is closed. WhatsApp only allows a
                  free-form reply within 24 hours of the contact&apos;s last
                  message — reaching them now requires a pre-approved template.
                </span>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  /* ------------------------------ List view ------------------------------ */
  return (
    <div className="space-y-4">
      <PageHeader
        title="WhatsApp"
        subtitle="Messages received on the WhatsApp Business number — read and reply"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => { loadList(); loadStats(); }}
            >
              <ArrowClockwise className="h-4 w-4" /> Refresh
            </Button>
            <Button
              onClick={() => {
                setNewError("");
                setShowNew((v) => {
                  const next = !v;
                  if (next && templates.length === 0) loadTemplates();
                  return next;
                });
              }}
            >
              <Plus className="h-4 w-4" /> New conversation
            </Button>
          </div>
        }
      />

      {showNew && (
        <Card>
          <CardHeader className="gap-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Start a new conversation</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowNew(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              You can only reach a contact who hasn&apos;t messaged in the last
              24 hours with a pre-approved WhatsApp template. Enter the number,
              the template name (as approved in Meta), and its body parameters.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {newError && <ErrorNotice message={newError} />}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="wa-new-to" className="text-sm font-medium text-foreground">
                  Recipient number
                </label>
                <Input
                  id="wa-new-to"
                  value={newTo}
                  onChange={(e) => setNewTo(e.target.value)}
                  placeholder="e.g. 919848945690 or +91 98489 45690"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="wa-new-template" className="text-sm font-medium text-foreground">
                  Template
                </label>
                <select
                  id="wa-new-template"
                  value={selectedTemplate ? `${newTemplate}::${newLang}` : ""}
                  onChange={(e) => {
                    const t = templates.find(
                      (x) => `${x.name}::${x.language}` === e.target.value
                    );
                    setNewTemplate(t?.name ?? "");
                    setNewLang(t?.language ?? "en");
                  }}
                  disabled={templatesLoading}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="" disabled>
                    {templatesLoading
                      ? "Loading templates…"
                      : templates.length === 0
                        ? "No approved templates"
                        : "Select a template"}
                  </option>
                  {templates.map((t) => (
                    <option
                      key={`${t.name}::${t.language}`}
                      value={`${t.name}::${t.language}`}
                    >
                      {t.name} ({t.language}) · {t.category}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {templatesError && (
              <p className="text-sm text-destructive">
                {templatesError}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={loadTemplates}
                >
                  Retry
                </button>
              </p>
            )}

            {selectedTemplate && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                {selectedTemplate.bodyText && (
                  <p className="mb-1 text-foreground">
                    “{selectedTemplate.bodyText}”
                  </p>
                )}
                <p>
                  Needs{" "}
                  <span className="font-medium text-foreground">
                    {selectedTemplate.bodyParamCount}
                  </span>{" "}
                  body parameter
                  {selectedTemplate.bodyParamCount === 1 ? "" : "s"}.
                  {selectedTemplate.needsMediaHeader && (
                    <span className="text-destructive">
                      {" "}
                      This template has a media header, which this quick sender
                      can&apos;t fill — it may fail.
                    </span>
                  )}
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_10rem]">
              <div className="space-y-1.5">
                <label htmlFor="wa-new-params" className="text-sm font-medium text-foreground">
                  Body parameters{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional, comma-separated — fills {"{{1}}"}, {"{{2}}"}…)
                  </span>
                </label>
                <Input
                  id="wa-new-params"
                  value={newParams}
                  onChange={(e) => setNewParams(e.target.value)}
                  placeholder="e.g. Sameer, VIP Pass"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="wa-new-lang" className="text-sm font-medium text-foreground">
                  Language
                </label>
                <Input
                  id="wa-new-lang"
                  value={newLang}
                  readOnly
                  className="bg-muted/50"
                  placeholder="en"
                  aria-label="Template language (set by the selected template)"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleStartConversation}
                disabled={starting || !newTo.trim() || !newTemplate.trim()}
              >
                <PaperPlaneTilt className="h-4 w-4" />
                {starting ? "Sending…" : "Send template"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((s) => (
          <StatCard key={s.title} {...s} loading={!stats} />
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <CardTitle className="text-base">Conversations</CardTitle>
            <div className="relative">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or number"
                className="w-56 pl-9"
                aria-label="Search WhatsApp conversations"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-4">
              <ErrorNotice message={error} />
            </div>
          )}

          {loading ? (
            <div className="space-y-px">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={WhatsappLogo}
              tone="neutral"
              title="No messages yet"
              description="When someone messages the WhatsApp Business number, the conversation will appear here for you to read and reply to."
            />
          ) : (
            <ul className="divide-y divide-border">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => openConversation(c.id)}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-foreground">
                          {conversationName(c)}
                        </p>
                        {c.unreadCount > 0 && (
                          <Badge variant="brand">{c.unreadCount} new</Badge>
                        )}
                        {c.replyWindowOpen && (
                          <Badge variant="success">Repliable</Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {messagePreview(c.messages?.[0])}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(c.lastMessageAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
