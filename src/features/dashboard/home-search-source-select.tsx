"use client";

import { useId } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SELECTABLE_HOME_SEARCH_SOURCES,
  type HomeSearchSourceId,
} from "@/lib/home-search-source";
import { cn } from "@/lib/utils";

function isSelectableHomeSearchSourceId(
  value: string,
): value is HomeSearchSourceId {
  return SELECTABLE_HOME_SEARCH_SOURCES.some((source) => source.id === value);
}

export function HomeSearchSourceSelect({
  value,
  onValueChange,
  disabled = false,
  size = "default",
  className,
}: {
  value: HomeSearchSourceId;
  onValueChange: (value: HomeSearchSourceId) => void;
  disabled?: boolean;
  size?: "default" | "sm";
  className?: string;
}) {
  const sourceId = useId();

  return (
    <div className={cn("inline-flex", className)}>
      <label htmlFor={sourceId} className="sr-only">
        Origen de la búsqueda
      </label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (isSelectableHomeSearchSourceId(next)) {
            onValueChange(next);
          }
        }}
      >
        <SelectTrigger
          id={sourceId}
          size="sm"
          aria-label="Origen de la búsqueda"
          className={cn(
            "animate-pulse-border shrink-0 border-surface-border bg-surface-pressed font-medium text-text-primary shadow-none",
            "hover:bg-accent-mint/70 focus-visible:animate-none focus-visible:border-accent focus-visible:ring-accent/40",
            "data-[state=open]:animate-none data-placeholder:text-text-secondary",
            "[&_svg]:text-text-secondary",
            size === "sm"
              ? "h-8 max-w-38 rounded-full px-3 text-xs"
              : "h-10 max-w-44 rounded-full px-3.5 text-sm",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          align="start"
          position="popper"
          className="min-w-44 rounded-xl border-surface-border bg-surface-raised p-1.5 text-text-primary shadow-md"
        >
          {SELECTABLE_HOME_SEARCH_SOURCES.map((option) => (
            <SelectItem
              key={option.id}
              value={option.id}
              className={cn(
                "cursor-pointer rounded-lg py-2 pr-8 pl-2.5 text-text-primary",
                "focus:!bg-accent-mint focus:!text-text-primary",
                "focus:**:!text-text-primary focus:[&_svg]:!text-text-primary",
                "data-[highlighted]:!bg-accent-mint data-[highlighted]:!text-text-primary",
                "data-[highlighted]:**:!text-text-primary data-[highlighted]:[&_svg]:!text-text-primary",
              )}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
