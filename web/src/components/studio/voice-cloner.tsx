"use client";

import * as React from "react";
import { AnimatePresence, motion, useTransform, type MotionValue } from "motion/react";
import { toast } from "sonner";

import { LiquidButton } from "@/components/animate-ui/buttons/liquid";
import { CloudUpload } from "@/components/animate-ui/icons/cloud-upload";
import { LoaderCircle } from "@/components/animate-ui/icons/loader-circle";
import { Mic } from "@/components/animate-ui/icons/mic";
import { Pause } from "@/components/animate-ui/icons/pause";
import { Play } from "@/components/animate-ui/icons/play";
import { RotateCcw } from "@/components/animate-ui/icons/rotate-ccw";
import { WandSparkles } from "@/components/animate-ui/icons/wand-sparkles";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useRecorder } from "@/hooks/use-recorder";
import { api, ApiError, type Voice } from "@/lib/api";
import { computePeaks, decodeToMono, encodeWav } from "@/lib/audio";
import { formatClock, formatSeconds } from "@/lib/format";
import { CLONE_PROMPT } from "@/lib/presets";
import { cn } from "@/lib/utils";

const MAX_RECORD_SECONDS = 15;
const MAX_KEEP_SECONDS = 20;

type Sample = { wav: Blob; url: string; duration: number; peaks: number[] };

function RecordTile({
  recording,
  elapsed,
  level,
  disabled,
  onClick,
}: {
  recording: boolean;
  elapsed: number;
  level: MotionValue<number>;
  disabled: boolean;
  onClick: () => void;
}) {
  const scale = useTransform(level, [0, 1], [1, 1.9]);
  const opacity = useTransform(level, [0, 1], [0.25, 0.75]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex h-36 flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed border-border bg-background/40 p-3 text-sm outline-none transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
        recording && "border-solid border-destructive/50 bg-destructive/5 hover:border-destructive/60 hover:bg-destructive/10",
      )}
    >
      <span className="relative flex size-14 items-center justify-center">
        {recording && <motion.span style={{ scale, opacity }} className="absolute inset-0 rounded-full bg-destructive/40" />}
        <span
          className={cn(
            "relative flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground",
            recording && "bg-destructive",
          )}
        >
          {recording ? <span className="size-4 rounded-[5px] bg-white" /> : <Mic size={22} animateOnHover />}
        </span>
      </span>
      <span className="font-medium">{recording ? "توقف ضبط" : "ضبط با میکروفون"}</span>
      <span className="text-xs text-muted-foreground" dir={recording ? "ltr" : undefined}>
        {recording ? `${formatClock(elapsed)} / ${formatClock(MAX_RECORD_SECONDS)}` : "۵ تا ۱۰ ثانیه"}
      </span>
    </button>
  );
}

function UploadTile({ disabled, onFile }: { disabled: boolean; onFile: (file: File) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (!disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file && !disabled) onFile(file);
      }}
      className={cn(
        "relative flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background/40 p-3 text-center text-sm outline-none transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50",
        dragging && "border-primary bg-primary/10",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <CloudUpload size={28} animate={dragging} loop={dragging} animateOnHover className="text-primary" />
      <span className="font-medium">{dragging ? "رها کنید" : "بارگذاری فایل"}</span>
      <span className="text-xs text-muted-foreground">WAV، MP3، M4A یا OGG</span>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function SamplePreview({ sample, onDiscard }: { sample: Sample; onDiscard: () => void }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/50 p-3">
      <audio
        ref={audioRef}
        src={sample.url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime / sample.duration)}
      />
      <button
        type="button"
        aria-label={playing ? "توقف" : "پخش نمونه"}
        onClick={() => (playing ? audioRef.current?.pause() : void audioRef.current?.play())}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <div className="flex h-10 min-w-0 flex-1 items-center gap-[2px]">
        {sample.peaks.map((peak, i) => (
          <motion.span
            key={i}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: i * 0.008, type: "spring", stiffness: 300, damping: 20 }}
            className={cn(
              "w-full flex-1 rounded-full transition-colors",
              i / sample.peaks.length < progress ? "bg-primary" : "bg-muted-foreground/30",
            )}
            style={{ height: `${Math.max(8, peak * 100)}%` }}
          />
        ))}
      </div>
      <div className="shrink-0 text-xs text-muted-foreground">{formatSeconds(sample.duration)}</div>
      <button
        type="button"
        onClick={onDiscard}
        aria-label="ضبط دوباره"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <RotateCcw size={16} animateOnHover />
      </button>
    </div>
  );
}

export function VoiceCloner({ disabled, onCreated }: { disabled: boolean; onCreated: (voice: Voice) => void }) {
  const recorder = useRecorder(MAX_RECORD_SECONDS);
  const [sample, setSample] = React.useState<Sample | null>(null);
  const [name, setName] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const recording = recorder.state === "recording";

  React.useEffect(() => () => (sample ? URL.revokeObjectURL(sample.url) : undefined), [sample]);

  const ingest = async (blob: Blob) => {
    setError(null);
    setBusy(true);
    try {
      const { samples, sampleRate, duration } = await decodeToMono(blob);
      if (duration < 3) {
        setError("نمونه کوتاه است؛ دست‌کم ۵ ثانیه صحبت کنید.");
        return;
      }
      const kept = samples.subarray(0, sampleRate * MAX_KEEP_SECONDS);
      const wav = encodeWav(kept, sampleRate);
      setSample({ wav, url: URL.createObjectURL(wav), duration: kept.length / sampleRate, peaks: computePeaks(kept, 48) });
    } catch {
      setError("این فایل صوتی خوانده نشد. یک فایل WAV، MP3 یا M4A امتحان کنید.");
    } finally {
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorder.stop();
      return;
    }
    const blob = await recorder.start();
    if (blob) await ingest(blob);
  };

  const reset = () => {
    setSample(null);
    setName("");
    setConsent(false);
    setError(null);
  };

  const save = async () => {
    if (!sample || !consent) return;
    setBusy(true);
    setError(null);
    try {
      const voice = await api.addVoice(sample.wav, name.trim() || "صدای من");
      toast.success("صدای شما ساخته شد", { description: "حالا می‌توانید با این صدا متن بسازید." });
      reset();
      onCreated(voice);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "ذخیرهٔ صدا ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3.5">
      <p className="text-sm leading-7 text-muted-foreground">
        ۵ تا ۱۰ ثانیه گفتار واضح، در محیط ساکت و بدون موسیقی. می‌توانید این متن را با لحن طبیعی بخوانید:
      </p>
      <blockquote className="rounded-lg border-s-2 border-primary/60 bg-muted/50 px-3.5 py-2.5 text-sm leading-7">
        {CLONE_PROMPT}
      </blockquote>

      <AnimatePresence mode="wait" initial={false}>
        {sample ? (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-3"
          >
            <SamplePreview sample={sample} onDiscard={reset} />
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
              placeholder="نام صدا، مثلاً «صدای من»"
              aria-label="نام صدا"
              className="h-10 rounded-md"
            />
            <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-6 text-muted-foreground">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-1" />
              تأیید می‌کنم این صدای خودم است یا از صاحب آن اجازهٔ صریح برای ساخت صدای مصنوعی دارم.
            </label>
            <LiquidButton
              type="button"
              onClick={save}
              disabled={!consent || busy}
              className="h-11 w-full rounded-md text-sm font-bold"
            >
              {busy ? <LoaderCircle size={18} animate loop /> : <WandSparkles size={18} animateOnHover />}
              ساخت و ذخیرهٔ صدا
            </LiquidButton>
          </motion.div>
        ) : (
          <motion.div
            key="capture"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-2 gap-3"
          >
            <RecordTile
              recording={recording}
              elapsed={recorder.elapsed}
              level={recorder.level}
              disabled={disabled || (busy && !recording)}
              onClick={toggleRecording}
            />
            <UploadTile disabled={disabled || busy || recording} onFile={ingest} />
          </motion.div>
        )}
      </AnimatePresence>

      {busy && !sample && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle size={14} animate loop /> در حال پردازش نمونه…
        </div>
      )}
      {(error || recorder.error) && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs leading-6 text-destructive">
          {error ?? recorder.error}
        </p>
      )}
      {disabled && (
        <p className="text-xs leading-6 text-muted-foreground">ساخت صدا پس از آماده شدن سرور و مدل فعال می‌شود.</p>
      )}
    </div>
  );
}
