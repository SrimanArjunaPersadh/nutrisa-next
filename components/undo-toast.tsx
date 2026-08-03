"use client";

/**
 * A single transient message with an optional action (PHASE-3-DECISIONS §6).
 *
 * Delete stays one tap — a confirm dialog would tax every delete to guard
 * against a rare mistap — and this is what makes that safe rather than merely
 * fast. It is also the delete path's ERROR surface: a failed delete says so in
 * the same slot, so nothing about the action is ever silent (§4.4).
 *
 * Deliberately not a toast LIBRARY. One message at a time is all this app needs,
 * and a queue/stack would be machinery ahead of need.
 */

import { useEffect } from "react";

export type ToastMessage = {
  text: string;
  tone: "info" | "error";
  action?: { label: string; onClick: () => void };
};

export type UndoToastProps = {
  message: ToastMessage | null;
  onDismiss: () => void;
  /** Errors linger; an undo offer expires. */
  timeoutMs?: number;
};

export function UndoToast({
  message,
  onDismiss,
  timeoutMs = 7000,
}: UndoToastProps) {
  const text = message?.text;
  const tone = message?.tone;

  useEffect(() => {
    if (!text) return;
    // Errors stay until dismissed: a failure the user missed is a failure they
    // will discover later, from wrong numbers.
    if (tone === "error") return;

    const id = setTimeout(onDismiss, timeoutMs);
    return () => clearTimeout(id);
  }, [text, tone, timeoutMs, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 pb-safe"
    >
      <div
        className={`pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-card border bg-bg2 px-4 py-3 shadow-lg ${
          message.tone === "error" ? "border-red/40" : "border-border"
        }`}
      >
        <span
          className={`text-label ${message.tone === "error" ? "text-red" : "text-text-2"}`}
        >
          {message.text}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          {message.action && (
            <button
              type="button"
              onClick={() => {
                message.action?.onClick();
                onDismiss();
              }}
              className="min-h-11 rounded-btn px-3 text-label font-semibold uppercase text-blue"
            >
              {message.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="min-h-11 rounded-btn px-3 text-label text-text-3"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
