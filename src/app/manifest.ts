import type { MetadataRoute } from "next";

// Web app manifest: makes Eboclean installable and is reused when packaging
// for Google Play (Trusted Web Activity) later.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Eboclean: cleaning help for ADHD & overwhelmed brains",
    short_name: "Eboclean",
    description:
      "Cleaning help for brains that hate starting. Tiny 2-minute steps, a friendly voice to start with you, and zero guilt.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#f4f5fb",
    theme_color: "#f4f5fb",
    categories: ["lifestyle", "productivity", "health"],
    lang: "en",
    dir: "ltr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "I'm overwhelmed (2-min task)",
        short_name: "SOS",
        url: "/?action=sos",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Scan a mess",
        short_name: "Scan",
        url: "/?action=scan",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
