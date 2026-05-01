import Image from "next/image";

type Props = {
  /** Subtitle under optional title */
  subtitle?: string;
  title?: string;
  className?: string;
};

export function SurvivorHeaderLogo({ subtitle, title, className = "" }: Props) {
  return (
    <header
      className={`border-b border-teal-800/40 bg-black/35 px-4 py-5 text-center shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md ${className}`}
    >
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3">
        {!title && <h1 className="sr-only">Survivor GO</h1>}
        <Image
          src="/survivor-go-logo.png"
          alt=""
          width={160}
          height={160}
          className="h-14 w-auto object-contain drop-shadow-[0_0_16px_rgba(251,191,36,0.2)] sm:h-16"
          aria-hidden
        />
        {title && (
          <h1 className="text-xl font-bold tracking-tight text-[#f5f0e6] sm:text-2xl">
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="text-sm text-teal-200/65">{subtitle}</p>
        )}
      </div>
    </header>
  );
}
