import Link from "next/link";

const linkCls =
  "rounded-lg px-3 py-2 text-xs font-medium text-amber-200/80 transition hover:bg-white/5 hover:text-amber-100 sm:text-sm";

export function SurvivorNav() {
  return (
    <nav
      className="flex flex-wrap items-center justify-center gap-1 border-t border-emerald-900/50 bg-black/40 px-4 py-3 backdrop-blur-sm"
      aria-label="Main navigation"
    >
      <Link href="/" className={linkCls}>
        Home
      </Link>
      <Link href="/play" className={linkCls}>
        Play
      </Link>
      <Link href="/map" className={linkCls}>
        Map
      </Link>
      <Link href="/join" className={linkCls}>
        Tribe
      </Link>
      <Link href="/dev" className={linkCls}>
        Dev
      </Link>
    </nav>
  );
}
