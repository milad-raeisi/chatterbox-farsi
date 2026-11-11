"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { Direction } from "radix-ui";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {/* Radix (and the Animate UI primitives built on it) read direction from here:
          sliders, tabs and arrow-key navigation all behave right-to-left. */}
      <Direction.Provider dir="rtl">
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster position="top-center" dir="rtl" richColors closeButton />
        </TooltipProvider>
      </Direction.Provider>
    </ThemeProvider>
  );
}
