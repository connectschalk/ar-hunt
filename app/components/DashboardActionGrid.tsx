"use client";

import Image from "next/image";

export type DashboardModalId =
  | "progress"
  | "status"
  | "bag"
  | "achievements";

const ACTIONS: {
  id: DashboardModalId;
  src: string;
  label: string;
}[] = [
  {
    id: "progress",
    src: "/dashboard-icons/progress.png",
    label: "Player Progress",
  },
  {
    id: "status",
    src: "/dashboard-icons/status.png",
    label: "Survivor Status",
  },
  { id: "bag", src: "/dashboard-icons/bag.png", label: "Bag Inventory" },
  {
    id: "achievements",
    src: "/dashboard-icons/achievements.png",
    label: "Achievements",
  },
];

type DashboardActionGridProps = {
  onOpen: (id: DashboardModalId) => void;
};

export function DashboardActionGrid({ onOpen }: DashboardActionGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      {ACTIONS.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onOpen(a.id)}
          aria-label={a.label}
          className="group relative aspect-square w-full overflow-hidden rounded-2xl border border-teal-600/40 bg-black/50 shadow-[0_0_24px_rgba(20,184,166,0.08)] transition hover:border-amber-500/35 hover:shadow-[0_0_32px_rgba(251,191,36,0.15)] active:scale-[0.98]"
        >
          <Image
            src={a.src}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, 240px"
            className="object-contain p-1 transition group-hover:brightness-110"
          />
        </button>
      ))}
    </div>
  );
}
