"use client";

import * as React from "react";
import { motion } from "motion/react";
import { CopyButton, CopyButtonIcon } from "@animate-ui/react/primitives/buttons/copy";
import { CheckIcon, CopyIcon } from "lucide-react";

import { RefreshCw } from "@/components/animate-ui/icons/refresh-cw";
import { TriangleAlert } from "@/components/animate-ui/icons/triangle-alert";
import { Button } from "@/components/ui/button";
import type { Health } from "@/lib/api";
import { toFa } from "@/lib/format";

function Command({ children }: { children: string }) {
  return (
    <div
      dir="ltr"
      className="mt-2 flex items-center gap-2 rounded-md border border-border/70 bg-background/70 py-1.5 ps-3 pe-1.5 font-mono text-[12.5px]"
    >
      <span className="text-primary select-none">$</span>
      <code className="min-w-0 flex-1 overflow-x-auto py-1 whitespace-nowrap">{children}</code>
      <CopyButton
        content={children}
        aria-label="کپی دستور"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <CopyButtonIcon icon={<CopyIcon className="size-4" />} copiedIcon={<CheckIcon className="size-4 text-success" />} />
      </CopyButton>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
        {toFa(n)}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-7">{children}</div>
    </li>
  );
}

export function SetupGuide({
  health,
  reachable,
  onRetry,
}: {
  health: Health | null;
  reachable: boolean | null;
  onRetry: () => void;
}) {
  const [retrying, setRetrying] = React.useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setTimeout(() => setRetrying(false), 800);
    }
  };

  let title: string;
  let body: React.ReactNode;
  if (reachable === false) {
    title = "سرور محلی آوا اجرا نیست";
    body = (
      <ol className="space-y-4">
        <Step n={1}>
          در یک ترمینال، در پوشهٔ پروژه این دستور را اجرا کنید:
          <Command>cd backend && uv run python -m app</Command>
        </Step>
        <Step n={2}>این صفحه به‌طور خودکار وصل می‌شود.</Step>
      </ol>
    );
  } else if (health?.status === "missing_models") {
    title = "مدل هنوز روی این دستگاه نصب نشده";
    body = (
      <>
        <ol className="space-y-4">
          <Step n={1}>
            مجوز مدل را در صفحهٔ{" "}
            <a href={health.model_url} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline" dir="ltr">
              mehdi-hf/chatterbox-farsi
            </a>{" "}
            بپذیرید (فقط یک بار).
          </Step>
          <Step n={2}>
            وارد حساب Hugging Face شوید و فایل‌ها را دریافت کنید؛ <b>فقط همین مرحله به اینترنت نیاز دارد</b>:
            <Command>cd backend && uv run hf auth login</Command>
            <Command>uv run python scripts/download_models.py</Command>
          </Step>
          <Step n={3}>دکمهٔ «بررسی دوباره» را بزنید. از این به بعد آوا کاملاً آفلاین کار می‌کند.</Step>
        </ol>
        {health.missing_files.length > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            فایل‌های موجود نیست:{" "}
            <span dir="ltr" className="font-mono">
              {health.missing_files.join(", ")}
            </span>
          </p>
        )}
      </>
    );
  } else if (health?.status === "error") {
    title = "بارگذاری مدل با خطا روبه‌رو شد";
    body = (
      <pre dir="ltr" className="overflow-x-auto rounded-md bg-background/70 p-3 font-mono text-xs leading-6 whitespace-pre-wrap text-destructive">
        {health.error}
      </pre>
    );
  } else {
    return null;
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card mx-auto mb-6 max-w-6xl rounded-xl border border-warning/40 p-5 sm:p-6"
      role="status"
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-md bg-warning/15 text-warning">
          <TriangleAlert size={20} animate loop loopDelay={2500} />
        </span>
        <h2 className="text-base font-bold">{title}</h2>
        {reachable && (
          <Button variant="outline" size="sm" className="ms-auto rounded-md" onClick={retry} disabled={retrying}>
            <RefreshCw size={15} animate={retrying} loop={retrying} animateOnHover />
            بررسی دوباره
          </Button>
        )}
      </div>
      {body}
    </motion.section>
  );
}
