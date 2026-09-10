import type { MetadataRoute } from "next";
import { ecosystemProducts } from "./lib/ecosystem";

const baseUrl = "https://www.gwapspot.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const primaryRoutes = [
    "",
    "/launch",
    "/gwapmojis",
    "/about",
    "/ecosystem",
    "/developers",
    "/roadmap",
    "/community",
    "/contact",
  ];

  return [
    ...primaryRoutes.map((route, index) => ({
      url: `${baseUrl}${route}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: index === 0 ? 1 : route === "/launch" || route === "/gwapmojis" ? 0.9 : 0.8,
    })),
    ...ecosystemProducts.map((product) => ({
      url: `${baseUrl}/ecosystem/${product.slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    {
      url: `${baseUrl}/privacy`,
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
  ];
}
