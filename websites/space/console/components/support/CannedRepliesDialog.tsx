"use client";

import { useState } from "react";
import { PencilSimple, Plus, Trash } from "@unifesto/unicon/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/console/components/ui/dialog";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Textarea } from "@/console/components/ui/textarea";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import {
  createCannedReply,
  updateCannedReply,
  deleteCannedReply,
  type CannedReply,
} from "@/console/lib/api/support-api";

/**
 * D19: add, edit and delete a desk's saved replies. No `spaceId` = the
 * Unifesto desk's. The composer's "Insert a saved reply" offers them.
 */
export function CannedRepliesDialog({
  open,
  onOpenChange,
  spaceId,
  replies,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId?: string;
  replies: CannedReply[];
  /** Called after any change, to reload the list. */
  onChange: () => void;
}) {
  // null = list, "new" = adding, otherwise the reply being edited.
  const [editing, setEditing] = useState<CannedReply | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const edit = (r: CannedReply | "new") => {
    setEditing(r);
    setTitle(r === "new" ? "" : r.title);
    setBody(r === "new" ? "" : r.body);
    setError("");
  };

  const save = async () => {
    if (!editing || !title.trim() || !body.trim()) return;
    setSaving(true);
    const input = { title: title.trim(), body: body.trim() };
    const { error } =
      editing === "new" ? await createCannedReply({ ...input, spaceId }) : await updateCannedReply(editing.id, input);
    setSaving(false);
    if (error) return setError(error.message || "Could not save the reply.");
    setEditing(null);
    onChange();
  };

  const remove = async (r: CannedReply) => {
    if (!window.confirm(`Delete "${r.title}"?`)) return;
    const { error } = await deleteCannedReply(r.id);
    if (error) return setError(error.message || "Could not delete the reply.");
    onChange();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setEditing(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Saved replies</DialogTitle>
          <DialogDescription>Answers your desk sends often. Insert one from the reply box, then edit it before sending.</DialogDescription>
        </DialogHeader>

        {error && <ErrorNotice message={error} />}

        {editing ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="canned-title">Title</Label>
              <Input id="canned-title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Ticket not received" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="canned-body">Reply</Label>
              <Textarea id="canned-body" value={body} rows={6} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || !title.trim() || !body.trim()}>
                {saving ? "Saving…" : "Save reply"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {replies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved replies yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {replies.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{r.body}</p>
                    </div>
                    <Button variant="ghost" size="sm" aria-label={`Edit ${r.title}`} onClick={() => edit(r)}>
                      <PencilSimple className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label={`Delete ${r.title}`} onClick={() => remove(r)}>
                      <Trash className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="outline" size="sm" onClick={() => edit("new")}>
              <Plus className="h-4 w-4" /> Add a reply
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
