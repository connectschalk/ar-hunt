"use client";

import Image from "next/image";
import type { BagItem } from "@/lib/survivor-mvp";

function rarityLabel(r: BagItem["rarity"]): string {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function rarityStyles(r: BagItem["rarity"]): string {
  switch (r) {
    case "rare":
      return "border-purple-500/35 bg-purple-950/30 text-purple-200/95";
    case "uncommon":
      return "border-cyan-500/35 bg-cyan-950/25 text-cyan-200/90";
    default:
      return "border-white/12 bg-black/35 text-zinc-300/90";
  }
}

export function PlayerBag({ items }: { items: BagItem[] }) {
  const sorted = [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.name.localeCompare(b.name);
  });

  if (sorted.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-teal-800/35 bg-black/35 px-3 py-3 text-center text-sm leading-snug text-teal-200/70">
        Your bag is empty. Explore the island to collect items.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-2.5">
      {sorted.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5"
        >
          <Image
            src={item.icon}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#f5f0e6]">
              {item.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${rarityStyles(item.rarity)}`}
              >
                {rarityLabel(item.rarity)}
              </span>
              <span className="text-xs tabular-nums text-teal-200/75">
                ×{item.quantity}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
