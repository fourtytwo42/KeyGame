import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return ["", "/play/4663", "/rules", "/supported-assets", "/status"].map(
    (path) => ({
      url: `${origin}${path}`,
      changeFrequency: path.includes("/play") ? "hourly" : "weekly",
      priority: path === "" ? 1 : 0.7,
    }),
  );
}
