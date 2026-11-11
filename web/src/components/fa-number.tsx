"use client";

import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";

import { cn } from "@/lib/utils";

/**
 * Animate UI's SlidingNumber with Persian digits. The «Ava Digits» font draws 0-9 as ۰-۹,
 * and `dir="ltr"` keeps the digit order right inside right-to-left text.
 */
export function FaNumber({
  value,
  decimals = 0,
  className,
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  return (
    <span dir="ltr" className={cn("inline-flex font-digits tabular-nums", className)}>
      <SlidingNumber
        number={Number.isFinite(value) ? value : 0}
        decimalPlaces={decimals}
        decimalSeparator="٫"
        thousandSeparator="٬"
      />
    </span>
  );
}
