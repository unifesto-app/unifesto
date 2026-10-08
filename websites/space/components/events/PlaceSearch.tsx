"use client";

import { useEffect, useRef, useState } from "react";
import { MagnifyingGlass, MapPin, CheckCircle, X } from "@unifesto/unicon/react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import {
  newSessionToken,
  pickPlace,
  placesEnabled,
  searchPlaces,
  type PickedPlace,
  type PlaceSuggestion,
} from "@/lib/googlePlaces";

interface PlaceSearchProps {
  /** Fills the venue fields and the exact coordinates. */
  onPick: (place: PickedPlace) => void;
  /** Current pin, shown as a confirmation line. */
  pinned: { latitude: number; longitude: number } | null;
  onClearPin: () => void;
}

/**
 * "Find the venue" search box backed by Google Places. Picking a result fills
 * the venue name, address, city and state, and stores exact coordinates so the
 * attendee app can drop a precise map pin. Renders nothing when no Maps key is
 * configured, leaving the manual fields as the only input.
 */
export function PlaceSearch({ onPick, pinned, onClearPin }: PlaceSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const tokenRef = useRef<unknown>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced autocomplete; one session token per search-and-pick.
  useEffect(() => {
    if (!placesEnabled) return;
    const q = query.trim();
    if (q.length < 3) return; // short queries are cleared in onChange
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        if (!tokenRef.current) tokenRef.current = await newSessionToken();
        const list = await searchPlaces(q, tokenRef.current);
        if (!cancelled) {
          setResults(list);
          setActive(0);
          setOpen(true);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Place search is unavailable right now. Fill the fields below instead.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Close the list on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  if (!placesEnabled) return null;

  async function choose(s: PlaceSuggestion) {
    setOpen(false);
    setLoading(true);
    try {
      const place = await pickPlace(s);
      onPick(place);
      setQuery("");
      setResults([]);
      tokenRef.current = null; // session ends at details; next search starts fresh
    } catch {
      setError("Couldn't load that place. Try another result or fill the fields below.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="space-y-2" ref={boxRef}>
      <div className="relative">
        <MagnifyingGlass
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          size={16}
        />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length < 3) {
              setResults([]);
              setOpen(false);
            }
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search for the venue on Google Maps"
          className="pl-9"
          role="combobox"
          aria-expanded={open}
          aria-controls="place-search-results"
          aria-autocomplete="list"
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        )}

        {open && results.length > 0 && (
          <ul
            id="place-search-results"
            role="listbox"
            className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-lg"
          >
            {results.map((r, i) => (
              <li
                key={r.placeId}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(r);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm",
                  i === active && "bg-muted"
                )}
              >
                <MapPin size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{r.primary}</span>
                  {r.secondary && (
                    <span className="block truncate text-xs text-muted-foreground">{r.secondary}</span>
                  )}
                </span>
              </li>
            ))}
            <li className="px-3 pt-1 text-right text-[10px] text-muted-foreground">Powered by Google</li>
          </ul>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {pinned ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle size={14} weight="fill" className="text-success" />
          Exact location pinned for the attendee map
          <button
            type="button"
            onClick={onClearPin}
            className="ml-1 inline-flex items-center gap-0.5 text-foreground underline-offset-2 hover:underline"
          >
            <X size={12} /> Remove pin
          </button>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Pick the venue to pin its exact spot on the attendee map, or fill the fields below.
        </p>
      )}
    </div>
  );
}
