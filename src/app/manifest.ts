import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Saved by the Bell",
    short_name: "Saved Bell",
    description: "The last caller holding the bell wins the broadcast.",
    start_url: "/",
    display: "standalone",
    background_color: "#F3E7C7",
    theme_color: "#241B32",
    icons: [
      {
        src: "/brand/icon-192-v2.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/icon-512-v2.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
