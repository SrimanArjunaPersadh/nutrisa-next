import { BottomNav } from "@/components/bottom-nav";

/**
 * The tab shell. Route-group folder, so "(tabs)" never appears in a URL —
 * Dashboard stays at "/" and the installed app launches straight onto it with
 * no redirect and no blank frame.
 */
export default function TabsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh">
      {/* Bottom padding clears the fixed nav plus the home indicator. */}
      <main className="mx-auto max-w-md px-4 pt-safe pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
