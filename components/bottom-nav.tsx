"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LayoutDashboard, TrendingDown, Utensils } from "lucide-react";

/* Four surfaces (§5). Weekly Check-In was cut (§0.2) — four tabs, not five. */
const TABS = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/nutrition", label: "Nutrition", Icon: Utensils },
  { href: "/weight", label: "Weight", Icon: TrendingDown },
  { href: "/library", label: "Library", Icon: BookOpen },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg2/95 px-safe pb-safe-nav pt-1 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map(({ href, label, Icon }) => {
          // "/" must match exactly or every route lights up the Dashboard tab.
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                // min-h-11 = 44px, the §1.4 touch-target floor.
                className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-btn px-2 py-1.5 transition-colors active:bg-bg3 ${
                  active ? "text-blue" : "text-text-3 hover:text-text-2"
                }`}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.4 : 2}
                  aria-hidden="true"
                />
                <span className="text-label font-medium">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
