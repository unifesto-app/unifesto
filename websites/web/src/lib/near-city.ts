/**
 * The visitor's city from the browser's location, reverse-geocoded (the same
 * service the home "What is on next" used). `prompt: false` only answers when
 * location access was already granted, so a page can say "near you" without
 * asking. null when unknown, denied or unavailable.
 */
export async function detectCity({ prompt }: { prompt: boolean }): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation || !window.isSecureContext) return null;
  if (!prompt) {
    const state = await navigator.permissions?.query({ name: "geolocation" }).then((p) => p.state, () => "prompt");
    if (state !== "granted") return null;
  }
  try {
    const { latitude, longitude } = await new Promise<GeolocationCoordinates>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 600000,
      }),
    );
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
    );
    const data = await res.json();
    return data?.city || data?.locality || data?.principalSubdivision || null;
  } catch {
    return null;
  }
}
