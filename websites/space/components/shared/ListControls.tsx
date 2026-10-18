"use client";

import { useState } from "react";
import { CaretLeft, CaretRight, MagnifyingGlass } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Case-insensitive "does any of these contain q" for client-side list search. */
export function matches(q: string, ...values: (string | null | undefined)[]): boolean {
  const term = q.trim().toLowerCase();
  return !term || values.some((v) => v?.toLowerCase().includes(term));
}

/**
 * Client-side paging over an already-loaded list. The page is clamped, so a
 * list that shrinks (a search, a delete) never strands you past the end; call
 * setPage(1) when the search changes.
 */
export function usePaged<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, totalPages);
  return {
    page: current,
    setPage,
    totalPages,
    pageItems: items.slice((current - 1) * pageSize, current * pageSize),
  };
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full max-w-sm">
      <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
      />
    </div>
  );
}

/** Prev / Next with "Page x of y"; renders nothing for a single page. */
export function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <CaretLeft className="h-4 w-4" />
          Prev
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
          <CaretRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
