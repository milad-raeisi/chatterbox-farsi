"use client";

import { Fade } from "@animate-ui/react/primitives/effects/fade";
import { RotatingText, RotatingTextContainer } from "@animate-ui/react/primitives/texts/rotating";

import { ShieldCheck } from "@/components/animate-ui/icons/shield-check";

const USES = ["کتاب صوتی", "پادکست", "ویدیو و تیزر", "پیام صوتی", "آموزش آنلاین", "دستیار هوشمند"];

export function Hero() {
  return (
    <section className="mx-auto max-w-3xl px-4 pt-10 pb-8 text-center sm:pt-14 sm:pb-10">
      <Fade inView inViewOnce>
        <span className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-background/50 px-3.5 py-1.5 text-xs text-muted-foreground">
          <ShieldCheck size={14} className="text-primary" animateOnView animateOnViewOnce />
          <span dir="ltr">Chatterbox Farsi</span>
          <span className="opacity-40">•</span>
          کاملاً آفلاین، روی دستگاه خودتان
        </span>
      </Fade>
      <Fade inView inViewOnce delay={0.08}>
        <h1 className="mt-5 text-[2rem] leading-[1.4] font-black tracking-tight text-balance sm:text-5xl sm:leading-[1.3]">
          متن فارسی را به{" "}
          <span className="whitespace-nowrap text-primary">صدای طبیعی</span>{" "}
          تبدیل کنید
        </h1>
      </Fade>
      <Fade inView inViewOnce delay={0.16}>
        <div className="mt-4 flex items-center justify-center gap-1.5 text-base text-muted-foreground sm:text-lg">
          <span>بسازید برای</span>
          <RotatingTextContainer text={USES} duration={2400} align="start" className="min-w-28 text-start">
            <RotatingText className="font-bold text-foreground" />
          </RotatingTextContainer>
        </div>
      </Fade>
    </section>
  );
}
