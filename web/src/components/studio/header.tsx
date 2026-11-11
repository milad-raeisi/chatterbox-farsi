"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { AudioLines } from "@/components/animate-ui/icons/audio-lines";
import { WifiOff } from "@/components/animate-ui/icons/wifi-off";
import {
  ThemeTogglerButton,
  ThemeTogglerButtonIcon,
} from "@/components/animate-ui/buttons/theme-toggler";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Health } from "@/lib/api";

import { StatusPill } from "./status-pill";

type ThemeSelection = "light" | "dark" | "system";

export function Header({
  health,
  reachable,
  busy,
}: {
  health: Health | null;
  reachable: boolean | null;
  busy: boolean;
}) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/55 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <a href="#" className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="relative flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <AudioLines size={22} animate={busy} loop={busy} animateOnHover />
          </span>
          <span className="leading-tight">
            <span className="block text-lg font-black tracking-tight">آوا</span>
            <span className="block text-[11px] text-muted-foreground">استودیوی صدای فارسی</span>
          </span>
        </a>

        <div className="ms-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                tabIndex={0}
                className="hidden h-8 items-center gap-1.5 rounded-md border border-border/70 bg-background/50 px-3 text-xs text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:inline-flex"
              >
                <WifiOff size={14} animateOnHover />
                آفلاین
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64 text-start leading-6">
              مدل، رابط کاربری و همهٔ فایل‌ها روی همین دستگاه هستند. آوا بدون اینترنت کار می‌کند و متن یا
              صدای شما به هیچ‌جا فرستاده نمی‌شود.
            </TooltipContent>
          </Tooltip>

          <StatusPill health={health} reachable={reachable} />

          <ThemeTogglerButton
            theme={(theme ?? "system") as ThemeSelection}
            resolvedTheme={resolvedTheme === "light" ? "light" : "dark"}
            setTheme={setTheme}
            variant="ghost"
            aria-label="تغییر پوسته"
          >
            <ThemeTogglerButtonIcon light={<SunIcon />} dark={<MoonIcon />} system={<MonitorIcon />} />
          </ThemeTogglerButton>
        </div>
      </div>
    </header>
  );
}
