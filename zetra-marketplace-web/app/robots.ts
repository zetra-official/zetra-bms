import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: "https://marketplace.zetra.co.tz/sitemap.xml",
    host: "https://marketplace.zetra.co.tz",
  };
}