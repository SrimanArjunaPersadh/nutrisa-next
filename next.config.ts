import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * DEV ONLY — who may load `/_next/*` from the dev server.
   *
   * Next 16 refuses dev-asset requests whose Origin it does not recognise. The
   * page's HTML still arrives, so the browser renders the server-rendered
   * markup — which for our client surfaces is the LOADING SKELETON, since every
   * hook starts in `loading`. The chunks are then blocked, hydration never runs,
   * and the skeleton stays on screen forever with nothing in the UI to say why.
   *
   * That is not an error state we could ever surface from the app: the code that
   * would set `state: 'error'` is in the JavaScript that never loaded.
   *
   * Verification is the owner's job ON THE PHONE (CLAUDE.md), so reaching the
   * dev server across the LAN is a required workflow here, not a convenience.
   *
   * `192.168.0.170` is this machine's Wi-Fi address; the subnet wildcard keeps
   * it working when DHCP hands out a different one. Has no effect on `next
   * build` or production — it governs the dev server only.
   */
  allowedDevOrigins: ["192.168.0.170", "192.168.0.*", "192.168.1.*"],
};

export default nextConfig;
