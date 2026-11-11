"use client";

import { motion } from "motion/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Health } from "@/lib/api";
import { toFa } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tone = "muted" | "success" | "warning" | "danger";

const DOT: Record<Tone, string> = {
  muted: "bg-muted-foreground",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

function describe(health: Health | null, reachable: boolean | null) {
  if (reachable === null) return { tone: "muted" as Tone, label: "در حال اتصال…", busy: true };
  if (!reachable) return { tone: "danger" as Tone, label: "سرور خاموش است", busy: false };
  switch (health?.status) {
    case "ready":
      return { tone: "success" as Tone, label: "آماده", busy: false };
    case "missing_models":
      return { tone: "danger" as Tone, label: "مدل نصب نشده", busy: false };
    case "error":
      return { tone: "danger" as Tone, label: "خطا در مدل", busy: false };
    default:
      return { tone: "warning" as Tone, label: "بارگذاری مدل…", busy: true };
  }
}

export function StatusPill({ health, reachable }: { health: Health | null; reachable: boolean | null }) {
  const { tone, label, busy } = describe(health, reachable);
  const device = health?.status === "ready" ? health.device_name : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          layout
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border/70 bg-background/50 px-3 text-xs font-medium"
          aria-label={`وضعیت مدل: ${label}`}
        >
          <span className="relative flex size-2">
            {busy && (
              <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-70", DOT[tone])} />
            )}
            <span className={cn("relative inline-flex size-2 rounded-full", DOT[tone])} />
          </span>
          <span className={cn(busy && "animate-pulse")}>{label}</span>
          {device && (
            <span className="hidden text-muted-foreground sm:inline" dir="ltr">
              {device}
            </span>
          )}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-72 text-start leading-6">
        {!reachable ? (
          "رابط کاربری به سرور محلی آوا وصل نیست."
        ) : health?.status === "ready" ? (
          <>
            مدل روی {health.device_name ?? health.device} اجرا می‌شود
            {health.load_seconds ? ` و در ${toFa(health.load_seconds)} ثانیه بارگذاری شد` : ""}. هیچ داده‌ای
            از این دستگاه خارج نمی‌شود.
          </>
        ) : health?.status === "missing_models" ? (
          "فایل‌های مدل هنوز دریافت نشده‌اند. راهنمای نصب را در صفحه ببینید."
        ) : health?.status === "error" ? (
          (health.error ?? "خطای نامشخص")
        ) : (
          "مدل در حال بارگذاری در حافظه است؛ این کار فقط یک بار در هر اجرا انجام می‌شود."
        )}
      </TooltipContent>
    </Tooltip>
  );
}
