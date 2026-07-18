import Image from "next/image";

import { cn } from "@/lib/utils";

const sizeMap = {
  sm: 28,
  md: 40,
  lg: 96,
  xl: 128,
} as const;

const sizeClassMap = {
  sm: "size-7",
  md: "size-10",
  lg: "size-24",
  xl: "size-32",
} as const;

export type LeadivaLogoSize = keyof typeof sizeMap;

type LeadivaLogoProps = {
  size?: LeadivaLogoSize;
  className?: string;
  priority?: boolean;
  /** Recolors the mark via CSS mask (works with the embedded PNG logo). */
  tone?: "default" | "teal";
};

export function LeadivaLogo({
  size = "md",
  className,
  priority = false,
  tone = "default",
}: LeadivaLogoProps) {
  const pixels = sizeMap[size];

  if (tone === "teal") {
    return (
      <span
        role="img"
        aria-label="Leadiva"
        className={cn(
          "inline-block shrink-0 bg-accent",
          "[mask-image:url(/leadiva.svg)] [mask-size:contain] [mask-repeat:no-repeat] [mask-position:center]",
          "[-webkit-mask-image:url(/leadiva.svg)] [-webkit-mask-size:contain] [-webkit-mask-repeat:no-repeat] [-webkit-mask-position:center]",
          sizeClassMap[size],
          className,
        )}
      />
    );
  }

  return (
    <Image
      src="/leadiva.svg"
      alt="Leadiva"
      width={pixels}
      height={pixels}
      priority={priority}
      unoptimized
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

type LeadivaBrandProps = {
  size?: LeadivaLogoSize;
  className?: string;
  showWordmark?: boolean;
  priority?: boolean;
};

export function LeadivaBrand({
  size = "sm",
  className,
  showWordmark = true,
  priority = false,
}: LeadivaBrandProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LeadivaLogo size={size} priority={priority} />
      {showWordmark ? (
        <span className="font-heading text-lg font-semibold tracking-tight text-accent">
          Leadiva
        </span>
      ) : null}
    </div>
  );
}
