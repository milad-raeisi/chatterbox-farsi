"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { DicesIcon } from "lucide-react";

import { Info } from "@/components/animate-ui/icons/info";
import { RotateCcw } from "@/components/animate-ui/icons/rotate-ccw";
import { SlidersHorizontal } from "@/components/animate-ui/icons/sliders-horizontal";
import { FaNumber } from "@/components/fa-number";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GenerationParams } from "@/lib/api";
import { DEFAULT_PARAMS, matchPreset, STYLE_PRESETS } from "@/lib/presets";

import { Panel } from "./panel";

function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="توضیح"
          className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <Info size={14} animateOnHover />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-start leading-6">{children}</TooltipContent>
    </Tooltip>
  );
}

function ParamSlider({
  label,
  hint,
  value,
  min,
  max,
  step,
  decimals,
  unit,
  onChange,
}: {
  label: string;
  hint: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const id = React.useId();
  return (
    <div>
      <div className="mb-3 flex items-center gap-1 text-sm">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <InfoTip>{hint}</InfoTip>
        <span className="ms-auto inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
          <FaNumber value={value} decimals={decimals} />
          {unit && <span className="text-muted-foreground">{unit}</span>}
        </span>
      </div>
      <Slider
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(Number(next.toFixed(decimals)))}
        aria-label={label}
      />
    </div>
  );
}

const FA_TO_LATIN = (text: string) => text.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const randomSeed = () => Math.floor(Math.random() * 1_000_000);

function SeedControl({ seed, onChange }: { seed: number | null; onChange: (seed: number | null) => void }) {
  const enabled = seed !== null;
  return (
    <div>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <Switch checked={enabled} onCheckedChange={(on) => onChange(on ? randomSeed() : null)} />
        <span className="font-medium">نتیجهٔ تکرارپذیر</span>
        <InfoTip>با یک «بذر» ثابت، همان متن و تنظیمات هر بار همان صدا را می‌سازد. خاموش باشد، هر بار کمی متفاوت است.</InfoTip>
      </label>
      <AnimatePresence initial={false}>
        {enabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-2 pt-3">
              <span className="text-xs text-muted-foreground">بذر</span>
              <Input
                dir="ltr"
                inputMode="numeric"
                aria-label="بذر"
                value={String(seed ?? "")}
                onChange={(event) => {
                  const n = parseInt(FA_TO_LATIN(event.target.value).replace(/\D/g, ""), 10);
                  onChange(Number.isFinite(n) ? Math.min(n, 2 ** 31 - 1) : 0);
                }}
                className="h-9 rounded-md text-center font-digits"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0 rounded-md"
                aria-label="بذر تصادفی"
                onClick={() => onChange(randomSeed())}
              >
                <motion.span whileTap={{ rotate: 180 }} className="inline-flex">
                  <DicesIcon />
                </motion.span>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function SettingsPanel({
  params,
  onChange,
  device,
}: {
  params: GenerationParams;
  onChange: (params: GenerationParams) => void;
  device: string | null;
}) {
  const preset = matchPreset(params);
  const set = <K extends keyof GenerationParams>(key: K, value: GenerationParams[K]) =>
    onChange({ ...params, [key]: value });
  const presetHint = STYLE_PRESETS.find((p) => p.id === preset)?.hint ?? "تنظیمات سفارشی";

  return (
    <Panel
      title="لحن و تنظیمات"
      icon={<SlidersHorizontal animateOnHover />}
      actions={
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 rounded-md text-xs text-muted-foreground"
          onClick={() => onChange({ ...DEFAULT_PARAMS, spell_numbers: params.spell_numbers })}
        >
          <RotateCcw size={14} animateOnHover />
          پیش‌فرض
        </Button>
      }
    >
      <div className="mb-2 text-xs font-medium text-muted-foreground">سبک گفتار</div>
      <ToggleGroup
        type="single"
        variant="outline"
        value={preset ?? ""}
        onValueChange={(id) => {
          const next = STYLE_PRESETS.find((p) => p.id === id);
          if (next) onChange({ ...params, ...next.values });
        }}
        className="grid w-full grid-cols-4"
      >
        {STYLE_PRESETS.map((p) => (
          <ToggleGroupItem key={p.id} value={p.id} className="text-xs">
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="mt-2 h-5 overflow-hidden text-xs text-muted-foreground">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={presetHint}
            className="block"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {presetHint}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="mt-4 space-y-6">
        <ParamSlider
          label="بیان احساس"
          hint="مقدار بیشتر، لحن را پرهیجان‌تر و اغراق‌آمیزتر می‌کند. مقدار پیش‌فرض ۰٫۵ است."
          value={params.exaggeration}
          min={0.25}
          max={2}
          step={0.05}
          decimals={2}
          onChange={(v) => set("exaggeration", v)}
        />
        <ParamSlider
          label="آهنگ و پایبندی"
          hint="مقدار کمتر (مثلاً ۰٫۳) گفتار را کمی آرام‌تر و شمرده‌تر می‌کند؛ مقدار بیشتر سریع‌تر و پایبندتر به متن است."
          value={params.cfg_weight}
          min={0}
          max={1}
          step={0.05}
          decimals={2}
          onChange={(v) => set("cfg_weight", v)}
        />
        <ParamSlider
          label="تنوع"
          hint="دمای نمونه‌برداری. مقدار بیشتر خروجی را متنوع‌تر ولی ناپایدارتر می‌کند. پیش‌فرض ۰٫۸ است."
          value={params.temperature}
          min={0.05}
          max={2}
          step={0.05}
          decimals={2}
          onChange={(v) => set("temperature", v)}
        />
        <ParamSlider
          label="مکث بین جمله‌ها"
          hint="سکوت میان بخش‌های متن. میان بندها (پاراگراف‌ها) دو برابر این مقدار مکث می‌شود."
          value={params.pause_ms}
          min={0}
          max={1000}
          step={50}
          decimals={0}
          unit="میلی‌ثانیه"
          onChange={(v) => set("pause_ms", v)}
        />
      </div>

      <Separator className="my-5" />
      <SeedControl seed={params.seed} onChange={(seed) => set("seed", seed)} />

      {device === "mps" && (
        <p className="mt-5 rounded-lg bg-warning/10 px-3.5 py-2.5 text-xs leading-6 text-muted-foreground">
          مدل روی پردازندهٔ گرافیکی Apple Silicon (MPS) اجرا می‌شود. به گفتهٔ سازندهٔ مدل کیفیت روی MPS
          پایین‌تر است؛ برای کیفیت بهتر سرور را بدون <span dir="ltr">AVA_DEVICE=mps</span> اجرا کنید.
        </p>
      )}
    </Panel>
  );
}
