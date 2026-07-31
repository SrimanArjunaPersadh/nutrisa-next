import type { MetadataRoute } from "next";

/**
 * PWA manifest (§4.5). Served at /manifest.webmanifest.
 *
 * The two hex values below are the one legitimate exception to "hex lives only
 * in globals.css": the browser reads this file to paint the splash screen
 * BEFORE any CSS is parsed, so it cannot reference a CSS variable. Both must
 * stay in lockstep with --bg. If --bg ever changes, change these too.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NutriSA",
    short_name: "NutriSA",
    description: "Weight, macros and trend tracking.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#0d0f14",
    background_color: "#0d0f14",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
