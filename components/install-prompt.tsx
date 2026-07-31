"use client";

import { Share, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

/** Not in lib.dom yet — Chromium-only, and still the standard install path. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "nutrisa:install-dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own non-standard flag.
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * A quiet, dismissible Add-to-Home-Screen affordance (§4.5) — not a nag.
 * Dismissal is remembered. iOS gets the manual hint because it has no
 * beforeinstallprompt event.
 */
/** None of these change within a session, so the store never needs to notify. */
const NEVER_CHANGES = () => () => {};

/** iOS has no beforeinstallprompt, so eligibility is a plain capability read. */
function iosEligibleSnapshot(): boolean {
  return (
    isIos() && !isStandalone() && localStorage.getItem(DISMISS_KEY) !== "1"
  );
}

export function InstallPrompt() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Reading browser capabilities is exactly what useSyncExternalStore is for:
  // the server snapshot is false, so nothing renders until hydration, and no
  // state is set inside an effect.
  const iosEligible = useSyncExternalStore(
    NEVER_CHANGES,
    iosEligibleSnapshot,
    () => false,
  );

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    if (isStandalone()) return; // already installed — nothing to offer
    if (isIos()) return; // handled by iosEligible above

    const onBeforeInstall = (event: Event) => {
      // Suppress the browser's own mini-infobar so ours is the only prompt.
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstallEvent(null);
      localStorage.setItem(DISMISS_KEY, "1");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setInstallEvent(null);
    setDismissed(true);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    // Either outcome retires the prompt: accepted installs it, dismissed is
    // an answer we respect rather than re-ask on the next page view.
    setInstallEvent(null);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  const showIosHint = iosEligible && !dismissed;
  const showInstallButton = installEvent !== null && !dismissed;

  if (!showInstallButton && !showIosHint) return null;

  return (
    <div
      role="complementary"
      aria-label="Install NutriSA"
      className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 px-4"
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-card border border-border bg-bg2 px-4 py-3 shadow-lg shadow-black/40">
        <div className="min-w-0 flex-1">
          <p className="text-card font-semibold text-text">Install NutriSA</p>
          {showIosHint ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-label text-text-2">
              Tap
              <Share size={13} aria-hidden="true" className="inline shrink-0" />
              <span>Share, then &ldquo;Add to Home Screen&rdquo;.</span>
            </p>
          ) : (
            <p className="mt-0.5 text-label text-text-2">
              Add it to your home screen for full-screen logging.
            </p>
          )}
        </div>

        {showInstallButton && (
          <button
            type="button"
            onClick={install}
            className="min-h-11 shrink-0 rounded-btn bg-blue px-4 text-card font-semibold text-white transition-opacity active:opacity-80"
          >
            Install
          </button>
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="grid min-h-11 w-11 shrink-0 place-items-center rounded-btn text-text-3 transition-colors hover:text-text active:bg-bg3"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
