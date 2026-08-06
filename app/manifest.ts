import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "GWAP — Grind With A Purpose",
    short_name: "GWAP",
    description: "The premium gateway to the connected GWAP ecosystem.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#030504",
    theme_color: "#030504",
    categories: ["business", "finance", "productivity", "social"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
