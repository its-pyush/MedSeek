import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MedSeek",
    short_name: "MedSeek",
    description: "Search symptoms and ask a health AI that knows your history.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff8eb",
    theme_color: "#fff8eb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
