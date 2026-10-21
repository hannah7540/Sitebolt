import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SiteBolt Worker",
    short_name: "SiteBolt",
    description: "SiteBolt worker dashboard for timesheets, SWMS, and site tasks.",
    start_url: "/worker-dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#f97316",
    orientation: "portrait",
    icons: [
      {
        src: "/file.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
