import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GWAP — Grind With A Purpose",
    short_name: "GWAP",
    description: "The official home of the GWAP ecosystem.",
    start_url: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#13DD13",
    icons: [{ src: "/logo.png", sizes: "512x512", type: "image/png" }],
  };
}
