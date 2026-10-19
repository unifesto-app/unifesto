/** Our own hosts; anything else is a space's custom domain (white-labelled). */
export const isOwnHost = (h: string) =>
  h === "unifesto.app" || h.endsWith(".unifesto.app") || h === "localhost" || /^[\d.]+$/.test(h) || h.endsWith(".localhost");
