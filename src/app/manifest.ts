import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Write.ai",
    short_name: "Write.ai",
    description: "Your personal AI writing studio.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f2ef",
    theme_color: "#1c1c1c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
