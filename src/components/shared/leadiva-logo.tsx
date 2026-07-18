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

const wordmarkClassMap = {
  sm: "text-lg font-semibold",
  md: "text-xl font-semibold",
  lg: "text-2xl font-bold",
  xl: "text-3xl font-bold",
} as const;

export type LeadivaLogoSize = keyof typeof sizeMap;

type LeadivaLogoProps = {
  size?: LeadivaLogoSize;
  className?: string;
  priority?: boolean;
};

/** Brand mark — always teal, matching the login treatment. */
export function LeadivaLogo({
  size = "md",
  className,
  priority: _priority = false,
}: LeadivaLogoProps) {
  return (
    <span
      role="img"
      aria-label="Leadiva AI"
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

type LeadivaWordmarkProps = {
  size?: LeadivaLogoSize;
  className?: string;
  as?: "span" | "p";
};

/** Wordmark — always “Leadiva AI” with coral AI, matching login. */
export function LeadivaWordmark({
  size = "sm",
  className,
  as: Tag = "span",
}: LeadivaWordmarkProps) {
  return (
    <Tag
      className={cn(
        "font-heading tracking-tight text-text-primary",
        wordmarkClassMap[size],
        className,
      )}
    >
      Leadiva <span className="text-accent-coral">AI</span>
    </Tag>
  );
}

type LeadivaBrandProps = {
  size?: LeadivaLogoSize;
  className?: string;
  showWordmark?: boolean;
  priority?: boolean;
  /** Horizontal (sidebar) or stacked (auth headers). */
  orientation?: "horizontal" | "stacked";
};

export function LeadivaBrand({
  size = "sm",
  className,
  showWordmark = true,
  priority = false,
  orientation = "horizontal",
}: LeadivaBrandProps) {
  return (
    <div
      className={cn(
        "flex items-center",
        orientation === "stacked"
          ? "flex-col gap-2 text-center"
          : "gap-2.5",
        className,
      )}
    >
      <LeadivaLogo size={size} priority={priority} />
      {showWordmark ? <LeadivaWordmark size={size} /> : null}
    </div>
  );
}
