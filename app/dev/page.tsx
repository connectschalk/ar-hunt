import Link from "next/link";
import { DevAuthEmail } from "@/app/components/DevAuthEmail";
import { SupabaseStatus } from "@/app/components/SupabaseStatus";

export const metadata = {
  title: "Developer AR tests · Survivor GO",
  description: "Internal AR diagnostic and GPS hunt test routes.",
};

export default function DevHubPage() {
  return (
    <div className="min-h-full bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-lg">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Developer
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">AR tests</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Preserved AR work for camera, A-Frame, and GPS placement. Not part of
          the main player flow.
        </p>
        <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Backend (dev check)
          </p>
          <div className="mt-2 space-y-2">
            <SupabaseStatus />
            <div className="border-t border-zinc-700/80 pt-2">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Auth session
              </p>
              <div className="mt-2">
                <DevAuthEmail />
              </div>
            </div>
          </div>
        </div>
        <ul className="mt-8 flex flex-col gap-3">
          <li>
            <Link
              href="/dev/ar-diagnostic"
              className="block rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:border-zinc-500"
            >
              A-Frame diagnostic (camera overlay + GLB)
            </Link>
          </li>
          <li>
            <Link
              href="/dev/astronaut-test"
              className="block rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:border-zinc-500"
            >
              GPS AR hunt + astronaut model test
            </Link>
          </li>
          <li>
            <Link
              href="/dev/ar-prompt"
              className="block rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:border-zinc-500"
            >
              AR permissions &amp; flow notes
            </Link>
          </li>
        </ul>
        <Link
          href="/"
          className="mt-10 inline-block text-sm text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
        >
          ← Back to Survivor GO
        </Link>
      </div>
    </div>
  );
}
