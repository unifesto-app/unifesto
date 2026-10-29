"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlass,
  ArrowRight,
  Buildings,
  SignOut,
} from "@unifesto/unicon/react";
import type { Icon } from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import { useCommandPalette } from "@/console/lib/context/CommandPaletteContext";
import { signOut } from "@/console/lib/utils/auth";
import { BASE_URL, accountGroup, resolveNavGroups } from "./nav-config";
import { cn } from "@/console/lib/utils/cn";

interface Command {
  id: string;
  label: string;
  /** Section the command is grouped under in the list. */
  group: string;
  icon: Icon;
  /** Extra match terms beyond the label. */
  keywords?: string;
  run: () => void;
}

/**
 * ⌘K / Ctrl-K jump-anywhere palette. Destinations are built from the same
 * `resolveNavGroups` the sidebar uses, so the palette lists exactly the pages
 * the current role can reach — plus quick actions (switch space, sign out).
 */
export function CommandPalette() {
  const router = useRouter();
  const { currentSpace, access, spaces, setCurrentSpace, hasAccess } = useSession();
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset transient state each time the palette opens, and focus the input.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlight(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];
    // The space sections need a role there; the personal one is everyone's (V9).
    const space = hasAccess ? currentSpace : null;

    // Navigation destinations, in the same order/grouping as the sidebar.
    for (const group of [accountGroup(hasAccess), ...(space ? resolveNavGroups(space, access) : [])]) {
      for (const item of group.items) {
        list.push({
          id: `nav:${item.href}`,
          label: item.label,
          group: group.label ?? "Overview",
          icon: item.icon,
          keywords: item.keywords,
          run: () => router.push(`${BASE_URL}${item.href}`),
        });
      }
    }

    // Switch to any other space the operator runs.
    for (const other of space ? spaces : []) {
      if (other.id === space?.id) continue;
      list.push({
        id: `space:${other.id}`,
        label: `Switch to ${other.name}`,
        group: "Spaces",
        icon: Buildings,
        keywords: "change switch space org",
        run: () => setCurrentSpace(other),
      });
    }

    list.push({
      id: "action:signout",
      label: "Sign out",
      group: "Account",
      icon: SignOut,
      keywords: "logout leave",
      run: () => {
        void signOut().then(() => router.replace("/login"));
      },
    });

    return list;
  }, [currentSpace, access, spaces, router, setCurrentSpace, hasAccess]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.group} ${c.keywords ?? ""}`.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Keep the highlight in range as results shrink/grow.
  useEffect(() => {
    setHighlight((h) => Math.min(h, Math.max(results.length - 1, 0)));
  }, [results.length]);

  const runAt = (index: number) => {
    const cmd = results[index];
    if (!cmd) return;
    setOpen(false);
    cmd.run();
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (results.length ? (h + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) =>
        results.length ? (h - 1 + results.length) % results.length : 0
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(highlight);
    }
  };

  // Scroll the highlighted row into view as the user arrows through.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${highlight}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  if (!open || !currentSpace) return null;

  // Group results for display while keeping a flat index for keyboard nav.
  let flatIndex = -1;
  const grouped: { group: string; items: { cmd: Command; index: number }[] }[] = [];
  for (const cmd of results) {
    flatIndex += 1;
    const last = grouped[grouped.length - 1];
    if (last && last.group === cmd.group) {
      last.items.push({ cmd, index: flatIndex });
    } else {
      grouped.push({ group: cmd.group, items: [{ cmd, index: flatIndex }] });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="absolute inset-0 bg-foreground/40"
        onClick={() => setOpen(false)}
      />
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-lg"
        onKeyDown={onListKeyDown}
      >
        {/* Search input — boxed field, inset from the palette edges so its
            focus ring (a global 4px :focus-visible shadow) never touches. */}
        <div className="border-b border-border p-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-ring/60">
            <MagnifyingGlass className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages and actions…"
              className="h-11 w-full bg-transparent text-base text-foreground outline-none [box-shadow:none] placeholder:text-muted-foreground focus-visible:[box-shadow:none]"
            />
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
              Esc
            </kbd>
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[min(24rem,60vh)] overflow-y-auto p-3">
          {results.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              No matches for “{query}”
            </p>
          ) : (
            grouped.map((section) => (
              <div key={section.group} className="mb-2 last:mb-0">
                <p className="px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.group}
                </p>
                {section.items.map(({ cmd, index }) => {
                  const Icon = cmd.icon;
                  const active = index === highlight;
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      data-index={index}
                      onMouseMove={() => setHighlight(index)}
                      onClick={() => runAt(index)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                        active
                          ? "bg-primary-soft text-primary"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <Icon
                        className="h-[18px] w-[18px] flex-shrink-0"
                        weight={active ? "fill" : "regular"}
                      />
                      <span className="flex-1 font-medium">{cmd.label}</span>
                      {active && (
                        <ArrowRight className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
