import type { MetadataRoute } from "next";

// For "Add to home screen": the name, the ink ground, and the rust-dot icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WeGoBeyond",
    short_name: "WeGoBeyond",
    description: "Workshops, meetups and hackathons for people who build.",
    start_url: "/",
    display: "browser",
    background_color: "#0e0c0b",
    theme_color: "#0e0c0b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
