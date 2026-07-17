"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type SkeuToggleProps = {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
};

function SkeuToggle({
  id,
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className,
}: SkeuToggleProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-3 text-sm text-text-secondary",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border border-surface-border",
          "bg-surface-pressed transition-colors duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          checked && "border-accent bg-accent",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-surface-raised",
            "border border-surface-border",
            "transition-transform duration-150 ease-out",
            checked && "translate-x-5 border-transparent",
          )}
        />
      </button>
      <span>{label}</span>
    </label>
  );
}

type SkeuCheckboxRowProps = {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
  className?: string;
};

function SkeuCheckboxRow({
  name,
  value,
  label,
  defaultChecked,
  className,
}: SkeuCheckboxRowProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md px-4 py-3",
        "border border-surface-border bg-surface-raised",
        "transition-colors duration-150 ease-out",
        "hover:bg-accent-mint/40 has-[:checked]:border-accent has-[:checked]:bg-accent-mint/70",
        className,
      )}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="size-4 accent-accent"
      />
      <span className="text-sm font-medium text-text-primary select-none">
        {label}
      </span>
    </label>
  );
}

export { SkeuToggle, SkeuCheckboxRow };
