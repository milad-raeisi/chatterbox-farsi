"use client";

import * as React from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { CopyButton, CopyButtonIcon } from "@animate-ui/react/primitives/buttons/copy";

import { LiquidButton } from "@/components/animate-ui/buttons/liquid";
import { Check } from "@/components/animate-ui/icons/check";
import { Copy } from "@/components/animate-ui/icons/copy";
import { Download } from "@/components/animate-ui/icons/download";
import { Pause } from "@/components/animate-ui/icons/pause";
import { Play } from "@/components/animate-ui/icons/play";
import { Volume2 } from "@/components/animate-ui/icons/volume-2";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, type HistoryItem } from "@/lib/api";
import { peaksFromUrl } from "@/lib/audio";
import { formatClock, formatSeconds, toFa } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Panel } from "./panel";

const BARS = 110;
const RATES = ["0.75", "1", "1.25", "1.5"];
const clamp = (v: number) => Math.min(1, Math.max(0, v));

function Waveform({
  peaks,
  progress,
  onSeek,
}: {
  peaks: number[] | null;
  progress: ReturnType<typeof useMotionValue<number>>;
  onSeek: (fraction: number) => void;
}) {
  // Right-to-left like the rest of the interface: time starts at the right edge.
  const clip = useTransform(progress, (p) => `inset(0 0 0 ${(1 - clamp(p)) * 100}%)`);
  const head = useTransform(progress, (p) => `${clamp(p) * 100}%`);
  const dragging = React.useRef(false);
  const bars = peaks ?? Array.from({ length: BARS }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 0.45)));

  const seekFrom = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(clamp((rect.right - event.clientX) / rect.width));
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="موقعیت پخش"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress.get() * 100)}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFrom(event);
      }}
      onPointerMove={(event) => dragging.current && seekFrom(event)}
      onPointerUp={() => (dragging.current = false)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onSeek(clamp(progress.get() + 0.05));
        if (event.key === "ArrowRight") onSeek(clamp(progress.get() - 0.05));
        if (event.key === "Home") onSeek(0);
      }}
      className="group relative h-20 cursor-pointer touch-none rounded-md outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className={cn("absolute inset-0 flex items-center gap-[2px]", !peaks && "animate-pulse")}>
        {bars.map((peak, i) => (
          <motion.span
            key={i}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: peaks ? i * 0.004 : 0, type: "spring", stiffness: 260, damping: 22 }}
            className="flex-1 rounded-full bg-muted-foreground/25"
            style={{ height: `${Math.max(6, peak * 100)}%` }}
          />
        ))}
      </div>
      {peaks && (
        <motion.div style={{ clipPath: clip }} className="pointer-events-none absolute inset-0 flex items-center gap-[2px]">
          {peaks.map((peak, i) => (
            <span
              key={i}
              className="flex-1 rounded-full bg-primary"
              style={{ height: `${Math.max(6, peak * 100)}%` }}
            />
          ))}
        </motion.div>
      )}
      <motion.span
        style={{ right: head }}
        className="pointer-events-none absolute inset-y-1 w-0.5 translate-x-1/2 rounded-full bg-foreground/70 opacity-0 transition-opacity group-hover:opacity-100"
      />
    </div>
  );
}

function PlayButton({ playing, onClick }: { playing: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.92 }}
      aria-label={playing ? "توقف" : "پخش"}
      className="relative flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
    >
      {playing && (
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-primary/60"
          animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: "easeOut" }}
        />
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={playing ? "pause" : "play"}
          initial={{ scale: 0.4, opacity: 0, filter: "blur(4px)" }}
          animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
          exit={{ scale: 0.4, opacity: 0, filter: "blur(4px)" }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="flex"
        >
          {playing ? <Pause size={26} /> : <Play size={26} className="translate-x-0.5" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

export function ResultPlayer({ item, autoPlay = false }: { item: HistoryItem; autoPlay?: boolean }) {
  const src = api.audioUrl(item);
  const duration = Math.max(item.duration, 0.01);
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const progress = useMotionValue(0);
  const [peaks, setPeaks] = React.useState<number[] | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [time, setTime] = React.useState(0);
  const [rate, setRate] = React.useState("1");

  React.useEffect(() => {
    const controller = new AbortController();
    peaksFromUrl(src, BARS, controller.signal)
      .then(setPeaks)
      .catch(() => undefined);
    return () => controller.abort();
  }, [src]);

  React.useEffect(() => {
    if (autoPlay) void audioRef.current?.play().catch(() => undefined);
  }, [autoPlay]);

  React.useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = Number(rate);
  }, [rate]);

  // Smooth progress while playing (timeupdate only fires a few times a second).
  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playing) return;
    let frame = 0;
    let shown = -1;
    const loop = () => {
      progress.set(audio.currentTime / duration);
      const second = Math.floor(audio.currentTime);
      if (second !== shown) {
        shown = second;
        setTime(audio.currentTime);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, progress]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const seek = (fraction: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = fraction * duration;
    progress.set(fraction);
    setTime(audio.currentTime);
  };

  const speed = item.rtf ? 1 / item.rtf : null;

  return (
    <Panel
      title="خروجی"
      icon={<Volume2 animate={playing} loop={playing} />}
      actions={<span className="truncate text-xs text-muted-foreground">صدای {item.voice_name}</span>}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          progress.set(1);
        }}
      />

      <div className="flex items-center gap-4">
        <PlayButton playing={playing} onClick={toggle} />
        <div className="min-w-0 flex-1">
          <Waveform peaks={peaks} progress={progress} onSeek={seek} />
          <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
            <span>{formatClock(time)}</span>
            <span>{formatClock(duration)}</span>
          </div>
        </div>
      </div>

      <p dir="auto" className="mt-4 line-clamp-3 text-sm leading-7 text-muted-foreground">
        {item.text}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={rate}
          onValueChange={(value) => value && setRate(value)}
          aria-label="سرعت پخش"
        >
          {RATES.map((r) => (
            <ToggleGroupItem key={r} value={r} className="px-2.5 text-xs">
              {toFa(r)}×
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <div className="ms-auto flex items-center gap-2">
          <CopyButton
            content={item.text}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border/70 bg-background/50 px-3 text-sm transition-colors hover:bg-muted"
          >
            <CopyButtonIcon icon={<Copy size={16} />} copiedIcon={<Check size={16} className="text-success" />} />
            کپی متن
          </CopyButton>
          <LiquidButton asChild className="h-10 rounded-md font-bold">
            <a href={api.downloadUrl(item)} download>
              <Download size={16} animateOnHover />
              دانلود WAV
            </a>
          </LiquidButton>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-md bg-muted/70 px-2.5 py-1">مدت: {formatSeconds(item.duration)}</span>
        <span className="rounded-md bg-muted/70 px-2.5 py-1">زمان ساخت: {formatSeconds(item.elapsed)}</span>
        {speed && (
          <span className="rounded-md bg-muted/70 px-2.5 py-1">
            {speed >= 1
              ? `${toFa(speed.toFixed(1))}× سریع‌تر از زمان واقعی`
              : `${toFa((1 / speed).toFixed(1))}× کندتر از زمان واقعی`}
          </span>
        )}
        <span className="rounded-md bg-muted/70 px-2.5 py-1">{toFa(item.chunks)} بخش</span>
      </div>
    </Panel>
  );
}
