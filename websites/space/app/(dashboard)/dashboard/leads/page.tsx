"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Funnel,
  Download,
  Plus,
  Trash,
  Sparkle,
  ChatCircle,
  CheckCircle,
  Archive,
} from "@unifesto/unicon/react";
import type { Icon } from "@unifesto/unicon/react";
import { useSpaceId } from "@/lib/hooks/useSpaceId";
import {
  listLeads,
  createLead,
  updateLead,
  deleteLead,
  type Lead,
  type LeadStatus,
  type LeadSource,
} from "@/lib/api/leads-api";
import { matches, Pager, SearchBox, usePaged } from "@/components/shared/ListControls";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const STATUS_ORDER: LeadStatus[] = ["NEW", "CONTACTED", "CONVERTED", "ARCHIVED"];
const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  CONVERTED: "Converted",
  ARCHIVED: "Archived",
};
const STATUS_VARIANT: Record<LeadStatus, "neutral" | "brand" | "success"> = {
  NEW: "brand",
  CONTACTED: "neutral",
  CONVERTED: "success",
  ARCHIVED: "neutral",
};
const SOURCE_LABEL: Record<LeadSource, string> = {
  EVENT_INTEREST: "Event interest",
  SPACE_INQUIRY: "Space inquiry",
  MANUAL: "Manual",
  IMPORT: "Import",
};
const STATUS_STAT: Record<LeadStatus, { icon: Icon; tone: "neutral" | "brand" | "success" }> = {
  NEW: { icon: Sparkle, tone: "brand" },
  CONTACTED: { icon: ChatCircle, tone: "neutral" },
  CONVERTED: { icon: CheckCircle, tone: "success" },
  ARCHIVED: { icon: Archive, tone: "neutral" },
};
const ALL = "__all__";

export default function LeadsPage() {
  const spaceId = useSpaceId();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [sourceFilter, setSourceFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");

  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    const { data, error } = await listLeads(spaceId, {
      status: statusFilter !== ALL ? (statusFilter as LeadStatus) : undefined,
      source: sourceFilter !== ALL ? (sourceFilter as LeadSource) : undefined,
    });
    if (error) setError(error.message ?? "Could not load leads.");
    else setLeads(data ?? []);
    setLoading(false);
  }, [spaceId, statusFilter, sourceFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<LeadStatus, number> = { NEW: 0, CONTACTED: 0, CONVERTED: 0, ARCHIVED: 0 };
    for (const l of leads) c[l.status] += 1;
    return c;
  }, [leads]);

  const shown = useMemo(
    () => leads.filter((l) => matches(search, l.name, l.email, l.phone, l.event?.title, l.message)),
    [leads, search]
  );
  const { page, setPage, totalPages, pageItems } = usePaged(shown, 25);

  const changeStatus = async (lead: Lead, status: LeadStatus) => {
    const { data, error } = await updateLead(spaceId, lead.id, { status });
    if (error) setError(error.message ?? "Could not update lead.");
    else if (data) setLeads((prev) => prev.map((l) => (l.id === lead.id ? data : l)));
  };

  const remove = async (lead: Lead) => {
    if (!window.confirm("Delete this lead? This cannot be undone.")) return;
    const { error } = await deleteLead(spaceId, lead.id);
    if (error) setError(error.message ?? "Could not delete lead.");
    else setLeads((prev) => prev.filter((l) => l.id !== lead.id));
  };

  const exportCsv = () => {
    if (shown.length === 0) return;
    const header = ["Name", "Email", "Phone", "Source", "Status", "Event", "Message", "Created"];
    const rows = shown.map((l) => [
      l.name ?? "",
      l.email ?? "",
      l.phone ?? "",
      SOURCE_LABEL[l.source],
      STATUS_LABEL[l.status],
      l.event?.title ?? "",
      l.message ?? "",
      new Date(l.createdAt).toISOString(),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Funnel className="h-4 w-4" weight="fill" />
            Community
          </span>
        }
        title="Leads"
        subtitle="People who registered interest or reached out — from event 'Notify me', space inquiries, or added by hand."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={shown.length === 0}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add lead
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUS_ORDER.map((s) => (
          <StatCard
            key={s}
            title={STATUS_LABEL[s]}
            value={counts[s]}
            icon={STATUS_STAT[s].icon}
            tone={STATUS_STAT[s].tone}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search name, email, phone or event"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUS_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sources</SelectItem>
            {(Object.keys(SOURCE_LABEL) as LeadSource[]).map((s) => (
              <SelectItem key={s} value={s}>
                {SOURCE_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : shown.length === 0 && search ? (
        <p className="text-sm text-muted-foreground">No leads match “{search}”.</p>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Funnel}
          title="No leads yet"
          description="Add the 'Notify me' button to your event pages or an inquiry form to your space page, and interested people land here."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((l) => (
                <tr key={l.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <p className="font-medium text-foreground">{l.name ?? "—"}</p>
                    {l.message && (
                      <p className="mt-0.5 line-clamp-2 max-w-xs text-xs text-muted-foreground">
                        {l.message}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <p>{l.email ?? "—"}</p>
                    {l.phone && <p className="text-xs text-muted-foreground">{l.phone}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="neutral">{SOURCE_LABEL[l.source]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{l.event?.title ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Select
                      value={l.status}
                      onValueChange={(v) => changeStatus(l, v as LeadStatus)}
                    >
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_ORDER.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="icon" onClick={() => remove(l)} aria-label="Delete">
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} totalPages={totalPages} onPage={setPage} />

      <AddLeadDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={async (payload) => {
          const { error } = await createLead(spaceId, payload);
          if (error) {
            setError(error.message ?? "Could not add lead.");
            return false;
          }
          setAddOpen(false);
          load();
          return true;
        }}
      />
    </div>
  );
}

function AddLeadDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (payload: {
    name?: string;
    email?: string;
    phone?: string;
    message?: string;
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setPhone("");
      setMessage("");
    }
  }, [open]);

  const submit = async () => {
    if (!email.trim() && !phone.trim()) return;
    setSaving(true);
    await onAdd({
      name: name || undefined,
      email: email || undefined,
      phone: phone || undefined,
      message: message || undefined,
    });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="leads-name">Name</Label>
            <Input id="leads-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="leads-email">Email</Label>
              <Input id="leads-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leads-phone">Phone</Label>
              <Input id="leads-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="leads-note">Note</Label>
            <Textarea id="leads-note" value={message} onChange={(e) => setMessage(e.target.value)} rows={2} />
          </div>
          <p className="text-xs text-muted-foreground">Provide at least an email or a phone number.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || (!email.trim() && !phone.trim())}>
            {saving ? "Adding…" : "Add lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
