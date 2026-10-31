"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { useSession } from "@/lib/context/SessionContext";
import {
  COMPANY_CATEGORIES,
  COMPANY_RECURRENCES,
  COMPANY_STATUSES,
  addCompanyNote,
  getCompanyItem,
  getCompanyItems,
  getCompanyPeople,
  upsertCompanyItem,
  type CompanyActivity,
  type CompanyCategory,
  type CompanyItem,
  type CompanyItemInput,
  type CompanyPerson,
  type CompanyRecurrence,
  type CompanyStatus,
} from "@/lib/api/company-api";

/** A dot and a word per status: plain coloured text, no pills. */
export const STATUS: Record<CompanyStatus, { label: string; dot: string }> = {
  TODO: { label: "To do", dot: "bg-muted-foreground" },
  IN_PROGRESS: { label: "In progress", dot: "bg-warning" },
  WAITING: { label: "Waiting", dot: "bg-primary" },
  FILED: { label: "Filed", dot: "bg-success/50" },
  DONE: { label: "Done", dot: "bg-success" },
  NA: { label: "Not needed", dot: "bg-border-strong" },
};

export const CATEGORY: Record<CompanyCategory, string> = {
  ROC: "ROC",
  TAX: "Tax",
  GST: "GST",
  IP: "IP",
  GOVERNANCE: "Governance",
  PEOPLE: "People",
  FINANCE: "Finance",
  FUNDING: "Funding",
};

const REPEATS: Record<CompanyRecurrence, string> = {
  NONE: "Doesn't repeat",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUAL: "Every year",
};

/** Still on us: filed, done and not-needed items are off the plate. */
export const OPEN_STATUSES: CompanyStatus[] = ["TODO", "IN_PROGRESS", "WAITING"];
export const isOpen = (i: CompanyItem) => OPEN_STATUSES.includes(i.status);

/** Local calendar day as YYYY-MM-DD, so IST mornings don't read as yesterday. */
export const today = () => new Date().toLocaleDateString("en-CA");
export const daysUntil = (due: string) => (Date.parse(due.slice(0, 10)) - Date.parse(today())) / 86_400_000;
export const isOverdue = (i: CompanyItem) => isOpen(i) && !!i.dueDate && daysUntil(i.dueDate) < 0;

/** Due dates are calendar days stored at UTC midnight; format them in UTC. */
export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const personName = (p?: CompanyPerson | null) => p?.fullName || p?.username || null;

const selectCls = "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground";

/** Items, the assignable team and what the caller may do, for both Company pages. */
export function useCompany() {
  const { user, role } = useSession();
  const [items, setItems] = useState<CompanyItem[] | null>(null);
  const [people, setPeople] = useState<CompanyPerson[]>([]);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const [i, p] = await Promise.all([getCompanyItems(), getCompanyPeople()]);
    if (i.error) setError(i.error.message);
    else {
      setError("");
      setItems(i.data ?? []);
    }
    setPeople(p.data ?? []);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const canManage = role === "platform_admin" || !!user?.platform?.includes("company:manage");
  return { items, people, error, reload, meId: user?.id, canManage };
}

export function ItemRow({ item, onOpen }: { item: CompanyItem; onOpen: () => void }) {
  const overdue = isOverdue(item);
  const s = STATUS[item.status];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-wrap items-baseline gap-x-4 gap-y-1 p-3 text-left text-sm transition-colors hover:bg-muted/50"
    >
      <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">C{item.number}</span>
      <span className="min-w-0 flex-1 basis-60 text-foreground">
        {item.title}
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {item.restricted && <Lock className="h-3 w-3" aria-label="Restricted" />}
          {CATEGORY[item.category]} · {personName(item.owner) ?? "Unassigned"}
        </span>
      </span>
      <span className={cn("w-32 text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
        {item.dueDate ? `${overdue ? "Overdue · " : ""}${fmtDate(item.dueDate)}` : "No due date"}
      </span>
      <span className="flex w-24 items-center gap-2 text-xs text-foreground">
        <span className={cn("h-2 w-2 rounded-full", s.dot)} aria-hidden />
        {s.label}
      </span>
    </button>
  );
}

type Detail = CompanyItem & { activity: CompanyActivity[] };

/**
 * One item: reads first, edits one step away, notes below. `number` null opens
 * the create form (company:manage). Owners without manage edit status, filing
 * and notes only, matching what the API allows them.
 */
export function CompanyItemDialog({
  number,
  people,
  canManage,
  meId,
  onClose,
  onSaved,
}: {
  number: number | null;
  people: CompanyPerson[];
  canManage: boolean;
  meId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [item, setItem] = useState<Detail | null>(null);
  const [editing, setEditing] = useState(number === null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (number === null) return;
    const { data, error: err } = await getCompanyItem(number);
    if (err) setError(err.message);
    else setItem(data);
  }, [number]);

  useEffect(() => {
    void load();
  }, [load]);

  const canEdit = canManage || (!!item && !!meId && item.ownerId === meId);

  const postNote = async () => {
    if (!item || !note.trim()) return;
    const { error: err } = await addCompanyNote(item.number, note.trim());
    if (err) return setError(err.message);
    setNote("");
    void load();
  };

  if (editing) {
    return (
      <ItemForm
        item={item}
        people={people}
        full={canManage}
        onCancel={() => (item ? setEditing(false) : onClose())}
        onSaved={() => {
          onSaved();
          if (!item) return onClose();
          setEditing(false);
          void load();
        }}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {!item ? (
          error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Skeleton className="h-48 w-full rounded-xl" />
          )
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono text-foreground">C{item.number}</span>
                <span>{CATEGORY[item.category]}</span>
                {item.restricted && (
                  <span className="flex items-center gap-1">
                    <Lock className="h-3 w-3" aria-hidden /> Restricted
                  </span>
                )}
              </div>
              <DialogTitle className="leading-snug">{item.title}</DialogTitle>
            </DialogHeader>
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <Field label="Status">
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", STATUS[item.status].dot)} aria-hidden />
                  {STATUS[item.status].label}
                </span>
              </Field>
              <Field label="Owner">{personName(item.owner) ?? "Unassigned"}</Field>
              <Field label="Due">
                <span className={cn(isOverdue(item) && "font-medium text-destructive")}>
                  {item.dueDate ? fmtDate(item.dueDate) : "None"}
                </span>
              </Field>
              <Field label="Repeats">{REPEATS[item.recurrence]}</Field>
              <Field label="Filed on">{item.filedOn ? fmtDate(item.filedOn) : "Not yet"}</Field>
              <Field label="Reference">{item.reference || "None"}</Field>
            </dl>
            {item.notes && (
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {item.notes}
              </p>
            )}

            <div className="space-y-2">
              <h3 className="text-xs text-muted-foreground">Activity</h3>
              {canEdit && (
                <div className="flex gap-2">
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void postNote()}
                    placeholder="Add a note"
                  />
                  <Button variant="outline" onClick={postNote} disabled={!note.trim()}>
                    Add
                  </Button>
                </div>
              )}
              <div className="max-h-48 divide-y divide-border overflow-y-auto">
                {item.activity.map((a) => (
                  <div key={a.id} className="py-2 text-sm">
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{a.actor}</span>
                      {new Date(a.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                    <p className="mt-0.5 break-words text-muted-foreground">{a.message}</p>
                  </div>
                ))}
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canEdit && <Button onClick={() => setEditing(true)}>Edit</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function ItemForm({
  item,
  people,
  full,
  onCancel,
  onSaved,
}: {
  item: CompanyItem | null;
  people: CompanyPerson[];
  /** company:manage: every field. Otherwise status, filing and notes. */
  full: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    title: item?.title ?? "",
    category: item?.category ?? ("ROC" as CompanyCategory),
    status: item?.status ?? ("TODO" as CompanyStatus),
    dueDate: item?.dueDate?.slice(0, 10) ?? "",
    ownerId: item?.ownerId ?? "",
    recurrence: item?.recurrence ?? ("NONE" as CompanyRecurrence),
    restricted: item?.restricted ?? false,
    filedOn: item?.filedOn?.slice(0, 10) ?? "",
    reference: item?.reference ?? "",
    notes: item?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    // Owners send only the fields the API lets them change.
    const input: CompanyItemInput = {
      number: item?.number,
      status: f.status,
      filedOn: f.filedOn || null,
      reference: f.reference.trim() || null,
      notes: f.notes.trim() || null,
    };
    if (full) {
      if (!f.title.trim()) return setError("Title is required.");
      Object.assign(input, {
        title: f.title.trim(),
        category: f.category,
        dueDate: f.dueDate || null,
        ownerId: f.ownerId || null,
        recurrence: f.recurrence,
        restricted: f.restricted,
      });
    }
    setSaving(true);
    const { error: err } = await upsertCompanyItem(input);
    setSaving(false);
    if (err) setError(err.message);
    else onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? `Edit C${item.number}` : "New obligation"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {full && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="co-title">Title</Label>
                <Textarea id="co-title" rows={2} value={f.title} onChange={set("title")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="co-category">Category</Label>
                  <select id="co-category" className={selectCls} value={f.category} onChange={set("category")}>
                    {COMPANY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY[c]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="co-owner">Owner</Label>
                  <select id="co-owner" className={selectCls} value={f.ownerId} onChange={set("ownerId")}>
                    <option value="">Unassigned</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {personName(p) ?? p.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="co-due">Due</Label>
                  <Input id="co-due" type="date" value={f.dueDate} onChange={set("dueDate")} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="co-repeats">Repeats</Label>
                  <select id="co-repeats" className={selectCls} value={f.recurrence} onChange={set("recurrence")}>
                    {COMPANY_RECURRENCES.map((r) => (
                      <option key={r} value={r}>
                        {REPEATS[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={f.restricted}
                  onChange={(e) => setF((s) => ({ ...s, restricted: e.target.checked }))}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                Restricted: only people with company:view-restricted see it
              </label>
            </>
          )}
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="co-status">Status</Label>
              <select id="co-status" className={selectCls} value={f.status} onChange={set("status")}>
                {COMPANY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="co-filed">Filed on</Label>
              <Input id="co-filed" type="date" value={f.filedOn} onChange={set("filedOn")} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="co-ref">Reference</Label>
              <Input id="co-ref" value={f.reference} onChange={set("reference")} placeholder="SRN" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="co-notes">Notes</Label>
            <Textarea id="co-notes" rows={3} value={f.notes} onChange={set("notes")} />
          </div>
          {full && f.recurrence !== "NONE" && (
            <p className="text-xs text-muted-foreground">Marking it Done adds the next one with the due date moved on.</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
