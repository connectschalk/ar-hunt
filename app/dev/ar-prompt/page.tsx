import Link from "next/link";

export const metadata = {
  title: "AR prompt notes · Survivor GO",
  description: "Developer notes for camera and location permissions in AR tests.",
};

export default function DevArPromptPage() {
  return (
    <div className="min-h-full bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-lg">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
          Developer
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">
          AR permissions &amp; flow
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          The GPS hunt test requests <strong className="text-zinc-200">location</strong>{" "}
          (watch position) and <strong className="text-zinc-200">camera</strong> when
          entering AR. Use HTTPS or localhost. iOS Safari is the most realistic
          mobile target.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">
          The diagnostic route uses camera only (no geolocation) for isolating GLB
          and A-Frame rendering.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/dev/ar-diagnostic"
            className="rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-black"
          >
            Open A-Frame diagnostic
          </Link>
          <Link
            href="/dev/astronaut-test"
            className="rounded-xl border border-zinc-600 bg-zinc-900 px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Open GPS / astronaut test
          </Link>
        </div>
        <Link
          href="/dev"
          className="mt-10 inline-block text-sm text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
        >
          ← All developer AR tests
        </Link>
      </div>
    </div>
  );
}
