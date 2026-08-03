import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes, last-wins on conflicts.
 *
 * shadcn/ui components import this by convention — every generated component in
 * `components/ui/` expects `@/lib/utils` to export it. It is theirs, not ours:
 * nothing in `lib/engine` or `lib/data` should ever need it.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
