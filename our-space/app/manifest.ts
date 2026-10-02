import type {
  MetadataRoute,
} from "next";

export default function manifest():
  MetadataRoute.Manifest {
  return {
    name: "Our Days",
    short_name: "Our Days",

    description:
      "A quiet little space for daily plans, focus, and shared moments.",

    start_url: "/today",
    scope: "/",

    display: "standalone",

    background_color:
      "#FBF7F1",

    theme_color:
      "#FBF7F1",

    orientation: "any",

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
