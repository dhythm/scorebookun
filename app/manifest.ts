import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "スコアブッくん",
    short_name: "スコアブッくん",
    description: "草野球の試合をスマホで記録できるスコアリングアプリ",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f3ee",
    theme_color: "#173f35",
    orientation: "portrait",
    categories: ["sports", "utilities"],
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
