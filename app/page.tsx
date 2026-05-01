import type { Metadata } from "next";
import Link from "next/link";
import { SurvivorNav } from "@/app/components/SurvivorNav";

export const metadata: Metadata = {
  title: { absolute: "Survivor GO" },
  description: "Explore. Collect. Compete.",
};

export default function Home() {
  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-[#0a1628] via-[#0c1f18] to-black text-zinc-100">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 pb-28">
        <div className="max-w-md text-center">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-amber-400/70">
            Welcome
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Survivor GO
          </h1>
          <p className="mt-4 text-lg text-emerald-200/70 sm:text-xl">
            Explore. Collect. Compete.
          </p>
        </div>
        <div className="mt-14 flex w-full max-w-sm flex-col gap-3">
          <Link
            href="/play"
            className="flex h-14 items-center justify-center rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 text-base font-bold text-emerald-950 shadow-lg shadow-amber-900/20 transition hover:from-amber-300 hover:to-amber-400 active:scale-[0.99]"
          >
            Start Game
          </Link>
          <Link
            href="/join"
            className="flex h-14 items-center justify-center rounded-2xl border border-emerald-700/50 bg-emerald-950/40 text-base font-semibold text-emerald-50 backdrop-blur-sm transition hover:border-emerald-500/50 hover:bg-emerald-900/50 active:scale-[0.99]"
          >
            Join Tribe
          </Link>
          <Link
            href="/dev/ar-diagnostic"
            className="mt-2 flex h-12 items-center justify-center rounded-xl text-sm font-medium text-zinc-500 transition hover:text-amber-200/80"
          >
            Developer AR Tests
          </Link>
        </div>
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-10">
        <SurvivorNav />
      </div>
    </div>
  );
}
