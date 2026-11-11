"use client";

import { BubbleBackground } from "@/components/animate-ui/backgrounds/bubble";

// Animate UI's bubble background in the Persian palette: turquoise, lapis and gold.
const COLORS = {
  first: "40,178,168",
  second: "56,88,190",
  third: "18,138,160",
  fourth: "214,166,80",
  fifth: "86,70,180",
  sixth: "70,205,190",
};

export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <BubbleBackground
        interactive
        colors={COLORS}
        className="pointer-events-auto absolute inset-0 bg-none bg-background opacity-45 dark:opacity-75"
      />
      <div className="girih absolute inset-0 opacity-[0.07] dark:opacity-[0.06]" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/70 to-background" />
    </div>
  );
}
