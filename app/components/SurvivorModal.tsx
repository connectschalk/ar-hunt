"use client";

import Image from "next/image";
import { useEffect, useId, useRef, type ReactNode } from "react";

type SurvivorModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Screen-reader / header title */
  title: string;
  /** Optional hero image (e.g. dashboard action icon) */
  iconSrc?: string;
};

export function SurvivorModal({
  open,
  onClose,
  children,
  title,
  iconSrc,
}: SurvivorModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("button, [href]")?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center p-3 sm:items-center sm:p-6"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(85vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-teal-500/35 bg-gradient-to-br from-[#0a1210] via-[#050608] to-black/90 shadow-[0_0_48px_rgba(20,184,166,0.12),inset_0_1px_0_rgba(251,191,36,0.1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 border-b border-teal-800/40 px-3 pb-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-2 top-2 z-10 rounded-xl border border-teal-700/50 bg-black/70 px-3 py-1.5 text-sm font-semibold text-teal-200/90 shadow-sm backdrop-blur-sm transition hover:border-amber-500/40 hover:text-amber-100"
          >
            Close
          </button>
          {iconSrc ? (
            <div className="flex flex-col items-center px-2 pb-1 pt-1">
              <div className="relative mx-auto h-24 w-24 shrink-0 sm:h-[7rem] sm:w-[7rem]">
                <Image
                  src={iconSrc}
                  alt=""
                  width={112}
                  height={112}
                  className="h-full w-full object-contain drop-shadow-[0_4px_22px_rgba(20,184,166,0.38),0_2px_14px_rgba(251,191,36,0.22)]"
                />
              </div>
              <h2
                id={titleId}
                className="mt-2 text-center text-sm font-semibold leading-snug text-amber-200/95"
              >
                {title}
              </h2>
            </div>
          ) : (
            <div className="flex min-h-[2.75rem] items-center justify-end py-2 pr-1">
              <h2 id={titleId} className="sr-only">
                {title}
              </h2>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {children}
        </div>
      </div>
    </div>
  );
}
