/**
 * Minimal Google Places (new API) client for the browser.
 *
 * Loads the Maps JavaScript API once with the `places` library and exposes
 * autocomplete + place details. Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — a
 * browser key with "Maps JavaScript API" and "Places API (New)" enabled,
 * restricted by HTTP referrer to the space app's domains.
 */

import { INDIAN_STATES } from "@/console/lib/constants/event-form";

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
export const placesEnabled = GOOGLE_MAPS_KEY.length > 0;

// The Maps JS API ships no types in this project; keep the surface we touch tiny.
/* eslint-disable @typescript-eslint/no-explicit-any */
type GoogleNS = any;
declare global {
  interface Window {
    google?: GoogleNS;
  }
}

let loading: Promise<GoogleNS> | null = null;

function loadMaps(): Promise<GoogleNS> {
  if (typeof window === "undefined") return Promise.reject(new Error("server"));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      GOOGLE_MAPS_KEY
    )}&v=weekly&loading=async&libraries=places`;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => {
      loading = null;
      reject(new Error("Could not load Google Maps"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

async function placesLib() {
  const google = await loadMaps();
  return google.maps.importLibrary("places");
}

export interface PlaceSuggestion {
  placeId: string;
  primary: string;
  secondary: string;
  /** Opaque handle used to fetch details (keeps the billing session intact). */
  raw: any;
}

export interface PickedPlace {
  name: string;
  address: string;
  city: string;
  /** Matched to INDIAN_STATES when possible, else "" (the select can't show unknown values). */
  state: string;
  latitude: number;
  longitude: number;
}

/**
 * One "session" = typing + picking. Google bills the whole session as a single
 * details request when a token is reused, so the caller keeps one per search.
 */
export async function newSessionToken(): Promise<any> {
  const { AutocompleteSessionToken } = await placesLib();
  return new AutocompleteSessionToken();
}

export async function searchPlaces(input: string, sessionToken: any): Promise<PlaceSuggestion[]> {
  const { AutocompleteSuggestion } = await placesLib();
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    sessionToken,
    includedRegionCodes: ["in"],
    language: "en",
  });
  return (suggestions ?? [])
    .map((s: any) => s.placePrediction)
    .filter(Boolean)
    .map((p: any) => ({
      placeId: p.placeId,
      primary: p.mainText?.text ?? p.text?.text ?? "",
      secondary: p.secondaryText?.text ?? "",
      raw: p,
    }));
}

function component(components: any[], type: string): string {
  return components?.find((c) => c.types?.includes(type))?.longText ?? "";
}

function matchState(name: string): string {
  if (!name) return "";
  const n = name.toLowerCase();
  return (
    INDIAN_STATES.find((s) => s.toLowerCase() === n) ??
    INDIAN_STATES.find((s) => n.includes(s.toLowerCase()) || s.toLowerCase().includes(n)) ??
    ""
  );
}

export async function pickPlace(suggestion: PlaceSuggestion): Promise<PickedPlace> {
  const place = suggestion.raw.toPlace();
  await place.fetchFields({
    fields: ["displayName", "formattedAddress", "location", "addressComponents"],
  });
  const comps = place.addressComponents ?? [];
  const city =
    component(comps, "locality") ||
    component(comps, "administrative_area_level_3") ||
    component(comps, "administrative_area_level_2");
  const state = matchState(component(comps, "administrative_area_level_1"));
  // The formatted address already ends in "City, State PIN, India"; the form
  // has separate City/State fields, so drop the trailing country.
  const address = String(place.formattedAddress ?? "").replace(/,\s*India$/i, "");

  return {
    name: place.displayName ?? suggestion.primary,
    address,
    city,
    state,
    latitude: place.location.lat(),
    longitude: place.location.lng(),
  };
}
