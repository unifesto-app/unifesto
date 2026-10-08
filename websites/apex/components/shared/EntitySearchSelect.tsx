"use client";

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, X, CircleNotch } from "@unifesto/unicon/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface EntitySearchSelectProps<T> {
  /** Called with the chosen entity's id, or null when the selection is cleared. */
  onChange: (id: string | null) => void;
  /** Debounced fetcher — return the matching entities for a query (≥2 chars). */
  search: (query: string) => Promise<T[]>;
  getId: (item: T) => string;
  /** Bold first line (e.g. a name/title). */
  getPrimary: (item: T) => string;
  /** Muted second line (e.g. email, slug, host). */
  getSecondary: (item: T) => string;
  placeholder?: string;
}

/**
 * Generic type-ahead picker for a single entity, backed by any `search(query)`
 * fetcher. Replaces pasting a raw UUID: the caller only receives the id via
 * `onChange`. Debounced so a fast typist fires one request per pause. Used for
 * users, events, and spaces in the email composer.
 */
export function EntitySearchSelect<T>({
  onChange,
  search,
  getId,
  getPrimary,
  getSecondary,
  placeholder,
}: EntitySearchSelectProps<T>) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<T | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search. Skips queries shorter than 2 chars to avoid huge lists.
  useEffect(() => {
    if (selected) return; // don't search while a pick is shown
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const items = await search(q).catch(() => [] as T[]);
      setResults(items);
      setLoading(false);
      setOpen(true);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, selected, search]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pick = (item: T) => {
    setSelected(item);
    setOpen(false);
    setQuery("");
    onChange(getId(item));
  };

  const clear = () => {
    setSelected(null);
    setResults([]);
    onChange(null);
  };

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
        <span className="flex flex-col">
          <span className="text-sm text-foreground">{getPrimary(selected)}</span>
          <span className="text-xs text-muted-foreground">
            {getSecondary(selected)}
          </span>
        </span>
        <Button variant="ghost" size="sm" onClick={clear}>
          <X className="mr-1 h-3.5 w-3.5" /> Change
        </Button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder ?? "Search…"}
          className="pl-9"
        />
        {loading && (
          <CircleNotch className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card shadow-md">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              {loading ? "Searching…" : "No matches."}
            </p>
          ) : (
            results.map((item) => (
              <button
                key={getId(item)}
                type="button"
                onClick={() => pick(item)}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted/60"
              >
                <span className="text-sm font-medium text-foreground">
                  {getPrimary(item)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {getSecondary(item)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
