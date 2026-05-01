import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SurvivorNav } from "@/app/components/SurvivorNav";
import { btnPrimary, btnSecondary, survivorPageBg } from "@/lib/survivor-ui";

export const metadata: Metadata = {
  title: { absolute: "Survivor GO" },
  description: "Explore. Collect. Compete.",
};

export default function Home() {
  return (
    <div className={survivorPageBg}>
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 pb-28">
        <div className="flex max-w-md flex-col items-center text-center">
          <h1 className="sr-only">Survivor GO</h1>
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-amber-300/80">
            Welcome
          </p>
          <div className="relative mt-6 w-full max-w-[min(100%,320px)] sm:max-w-[380px]">
            <Image
              src="/survivor-go-logo.png"
              alt="Survivor GO!"
              width={1024}
              height={1024}
              priority
              className="h-auto w-full drop-shadow-[0_0_40px_rgba(251,191,36,0.18),0_16px_48px_rgba(0,0,0,0.55)]"
            />
          </div>
          <p className="mt-8 text-lg text-[#f5f0e6]/90 sm:text-xl">
            Explore. Collect. Compete.
          </p>
        </div>
        <div className="mt-14 flex w-full max-w-sm flex-col gap-3">
          <Link href="/play" className={`flex h-14 items-center justify-center ${btnPrimary}`}>
            Start Game
          </Link>
          <Link
            href="/join"
            className={`flex h-14 items-center justify-center ${btnSecondary}`}
          >
            Join Tribe
          </Link>
          <Link
            href="/dev/ar-diagnostic"
            className="mt-2 flex h-12 items-center justify-center rounded-xl text-sm font-medium text-teal-600/80 transition hover:text-amber-200/90"
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
