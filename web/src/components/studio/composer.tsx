"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { RippleButton, RippleButtonRipples } from "@animate-ui/react/primitives/buttons/ripple";

import { Check } from "@/components/animate-ui/icons/check";
import { LoaderCircle } from "@/components/animate-ui/icons/loader-circle";
import { Sparkles } from "@/components/animate-ui/icons/sparkles";
import { Type } from "@/components/animate-ui/icons/type";
import { X } from "@/components/animate-ui/icons/x";
import { FaNumber } from "@/components/fa-number";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatSeconds, toFa } from "@/lib/format";
import { SAMPLE_TEXTS } from "@/lib/presets";
import { cn } from "@/lib/utils";

import { Panel } from "./panel";

export type Job = {
  phase: "queued" | "running" | "finishing";
  chunks: string[];
  completed: number;
  total: number;
  startedAt: number;
};

const noop = () => () => {};

function useIsMac() {
  return React.useSyncExternalStore(
    noop,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
}

function useElapsed(since: number) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, (now - since) / 1000);
}

function Dot() {
  return <span className="size-1 rounded-full bg-muted-foreground/40" aria-hidden />;
}

function ChunkList({
  chunks,
  completed = -1,
  active = false,
  className,
}: {
  chunks: string[];
  completed?: number;
  active?: boolean;
  className?: string;
}) {
  const listRef = React.useRef<HTMLOListElement>(null);

  React.useEffect(() => {
    const list = listRef.current;
    const item = list?.children[completed] as HTMLElement | undefined;
    if (list && item) list.scrollTo({ top: item.offsetTop - list.clientHeight / 3, behavior: "smooth" });
  }, [completed]);

  return (
    <ol ref={listRef} className={cn("relative space-y-1 overflow-y-auto pe-1", className)}>
      {chunks.map((chunk, i) => {
        const state =
          completed < 0 ? "idle" : i < completed ? "done" : i === completed && active ? "active" : "pending";
        return (
          <li
            key={i}
            className={cn(
              "flex items-start gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] leading-7 transition-colors duration-300",
              state === "active" && "bg-background/80 text-foreground",
              state === "pending" && "text-muted-foreground/70",
              state === "done" && "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px]",
                state === "done" && "border-success/40 bg-success/15 text-success",
                state === "active" && "border-primary/60 text-primary",
              )}
            >
              {state === "done" ? (
                <Check size={12} animate />
              ) : state === "active" ? (
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              ) : (
                toFa(i + 1)
              )}
            </span>
            <span dir="auto">{chunk}</span>
          </li>
        );
      })}
    </ol>
  );
}

function GenerationProgress({ job }: { job: Job }) {
  const elapsed = useElapsed(job.startedAt);
  const pct = job.total ? Math.round((job.completed / job.total) * 100) : 0;
  const label =
    job.phase === "queued"
      ? "در صف؛ درخواست قبلی در حال پردازش است…"
      : job.phase === "finishing"
        ? "در حال آماده‌سازی فایل نهایی…"
        : job.total > 1
          ? `در حال ساخت بخش ${toFa(Math.min(job.completed + 1, job.total))} از ${toFa(job.total)}…`
          : "در حال ساخت صدا…";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 32 }}
      className="overflow-hidden"
      aria-live="polite"
    >
      <div className="mt-4 rounded-lg border border-primary/25 bg-primary/[0.06] p-4">
        <div className="flex items-center gap-2.5 text-sm font-medium">
          <LoaderCircle size={18} animate loop className="shrink-0 text-primary" />
          <span>{label}</span>
          <span className="ms-auto inline-flex items-center text-xs text-muted-foreground">
            <FaNumber value={pct} suffix="٪" />
          </span>
        </div>
        <Progress value={pct} className="mt-3 h-2" />
        {job.chunks.length > 1 && (
          <ChunkList
            chunks={job.chunks}
            completed={job.completed}
            active={job.phase !== "queued"}
            className="mt-3 max-h-44"
          />
        )}
        <div className="mt-2.5 text-xs text-muted-foreground">زمان سپری‌شده: {formatSeconds(elapsed)}</div>
      </div>
    </motion.div>
  );
}

function GenerateButton({
  running,
  disabledReason,
  onClick,
}: {
  running: boolean;
  disabledReason: string | null;
  onClick: () => void;
}) {
  const isMac = useIsMac();
  const disabled = running || disabledReason !== null;

  const button = (
    <RippleButton
        type="button"
        onClick={onClick}
        disabled={disabled}
        hoverScale={1.02}
        className="relative inline-flex h-12 w-full items-center justify-center gap-2.5 overflow-hidden rounded-lg bg-primary px-6 text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 outline-none focus-visible:ring-4 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
      >
        {running ? <LoaderCircle size={20} animate loop /> : <Sparkles size={20} animateOnHover />}
        {running ? "در حال ساخت…" : "ساخت صدا"}
        {!running && (
          <Kbd dir="ltr" className="hidden border border-white/25 bg-white/15 text-white sm:inline-flex">
            {isMac ? "⌘" : "Ctrl"} ↵
          </Kbd>
        )}
        <RippleButtonRipples color="rgba(255,255,255,0.5)" />
      </RippleButton>
  );

  if (running || disabledReason === null) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="flex w-full rounded-lg outline-none sm:inline-flex sm:w-auto">
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}

export interface ComposerProps {
  text: string;
  onTextChange: (text: string) => void;
  spellNumbers: boolean;
  onSpellNumbersChange: (value: boolean) => void;
  maxChars: number;
  previewChunks: string[];
  seconds: number;
  job: Job | null;
  disabledReason: string | null;
  onGenerate: () => void;
  onCancel: () => void;
}

export function Composer({
  text,
  onTextChange,
  spellNumbers,
  onSpellNumbersChange,
  maxChars,
  previewChunks,
  seconds,
  job,
  disabledReason,
  onGenerate,
  onCancel,
}: ComposerProps) {
  const running = job !== null;
  const over = text.length > maxChars;
  const chunkCount = text.trim() ? Math.max(1, previewChunks.length) : 0;

  return (
    <Panel title="متن" icon={<Type animateOnHover />}>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="me-1 text-xs text-muted-foreground">نمونه‌ها:</span>
        {SAMPLE_TEXTS.map((sample, i) => (
          <motion.button
            key={sample.id}
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i }}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.95 }}
            disabled={running}
            onClick={() => onTextChange(sample.text)}
            className={cn(
              "rounded-md border border-border/70 bg-background/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
              text === sample.text && "border-primary/50 bg-primary/12 text-foreground",
            )}
          >
            {sample.label}
          </motion.button>
        ))}
      </div>

      <div
        className={cn(
          "relative rounded-lg border border-input bg-background/60 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25",
          over && "border-destructive/60 focus-within:border-destructive focus-within:ring-destructive/20",
        )}
      >
        <textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          readOnly={running}
          dir="auto"
          rows={7}
          spellCheck={false}
          aria-label="متن برای تبدیل به گفتار"
          placeholder="متن فارسی خود را اینجا بنویسید یا بچسبانید…"
          className="block min-h-48 w-full resize-y rounded-t-lg bg-transparent px-4 pt-4 pb-3 text-[17px] leading-9 outline-none sm:min-h-56"
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1", over && "font-medium text-destructive")}>
            <FaNumber value={text.length} />
            <span className="opacity-60">/ {toFa(maxChars)}</span>
            نویسه
          </span>
          <Dot />
          <span className="inline-flex items-center gap-1">
            <FaNumber value={chunkCount} /> بخش
          </span>
          <Dot />
          <span className="inline-flex items-center gap-1">
            حدود <FaNumber value={Math.round(seconds)} /> ثانیه
          </span>
          {text && !running && (
            <button
              type="button"
              onClick={() => onTextChange("")}
              className="ms-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
            >
              <X size={14} animateOnHover />
              پاک کردن
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Switch checked={spellNumbers} onCheckedChange={onSpellNumbersChange} disabled={running} />
          <span>
            خواندن اعداد به حروف
            <span className="ms-1.5 text-xs text-muted-foreground">(۱۴۰۲ ← هزار و چهارصد و دو)</span>
          </span>
        </label>
        <div className="flex items-center gap-2 sm:ms-auto">
          <AnimatePresence>
            {running && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                <Button variant="ghost" onClick={onCancel} className="h-12 rounded-lg px-4">
                  <X animateOnHover />
                  لغو
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex-1 sm:flex-none">
            <GenerateButton running={running} disabledReason={disabledReason} onClick={onGenerate} />
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>{job && <GenerationProgress key="progress" job={job} />}</AnimatePresence>

      {!job && previewChunks.length > 0 && (
        <Accordion type="single" collapsible className="mt-1">
          <AccordionItem value="preview" className="border-none">
            <AccordionTrigger className="py-3 text-xs font-normal text-muted-foreground hover:text-foreground hover:no-underline">
              پیش‌نمایش خوانش: متن پس از یکسان‌سازی، در {toFa(previewChunks.length)} بخش خوانده می‌شود
            </AccordionTrigger>
            <AccordionContent>
              <ChunkList chunks={previewChunks} className="max-h-60 rounded-lg bg-muted/40 p-1.5" />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </Panel>
  );
}
