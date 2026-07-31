import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { InstallPrompt } from "@/components/install-prompt";
import { ServiceWorker } from "@/components/service-worker";

/* Barlow 400–600 — body, labels, controls, evidence text (§4.2). */
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-barlow",
  display: "swap",
});

/* Barlow Condensed 800 italic — stats, big numbers, page titles (§4.2).
   The characterful display face, used with restraint. */
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["800"],
  style: ["italic"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NutriSA",
  description: "Weight, macros and trend tracking.",
  manifest: "/manifest.webmanifest",
  applicationName: "NutriSA",
  appleWebApp: {
    capable: true,
    title: "NutriSA",
    // black-translucent lets the app paint under the status bar, which is what
    // makes the safe-area insets in globals.css actually matter.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  // Splash and status bar match --bg so launch feels native, not a white
  // flash (§4.5). Hex here is unavoidable — the browser reads this before CSS.
  themeColor: "#0d0f14",
  // The reason env(safe-area-inset-*) resolves to anything but 0.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  // Zoom is deliberately NOT disabled — never trade accessibility for chrome.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        <InstallPrompt />
        <ServiceWorker />
      </body>
    </html>
  );
}
