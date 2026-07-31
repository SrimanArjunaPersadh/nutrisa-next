import type { LucideIcon } from "lucide-react";

/**
 * Phase 0 placeholder for a tab that has not been built yet.
 *
 * These are STUBS, not surfaces — they are not the §4.4 Empty state and they do
 * not earn a tick in STATUS.md. They exist so the tab shell is navigable and so
 * no tab is ever a blank void. Each is replaced wholesale by its own phase.
 */
export function SurfaceStub({
  title,
  icon: Icon,
  arrives,
}: {
  title: string;
  icon: LucideIcon;
  arrives: string;
}) {
  return (
    <section>
      <h1 className="pt-6 pb-5 font-display text-title text-text">{title}</h1>

      <div className="rounded-card border border-border bg-bg2 px-5 py-10 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-card bg-bg3 text-text-3">
          <Icon size={22} aria-hidden="true" />
        </div>
        <p className="mt-4 text-body font-semibold text-text">
          Not built yet.
        </p>
        <p className="mx-auto mt-1 max-w-[28ch] text-body text-text-2">
          {arrives}
        </p>
      </div>
    </section>
  );
}
