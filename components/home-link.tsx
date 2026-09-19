import { House } from "lucide-react";
import Link from "next/link";

/**
 * The way out of a game without ending it. The game stays on the server, and
 * it remains in this device's history, so leaving loses nothing.
 */
export function HomeLink() {
  return (
    <Link
      href="/"
      aria-label="トップページへ戻る"
      className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-primary-foreground outline-none hover:bg-primary-foreground/10 focus-visible:ring-[3px] focus-visible:ring-primary-foreground/50"
    >
      <House className="h-5 w-5" aria-hidden="true" />
    </Link>
  );
}
