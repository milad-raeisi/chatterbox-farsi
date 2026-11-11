"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import { useHealth } from "@/hooks/use-health";
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  api,
  ApiError,
  synthesize,
  type Analysis,
  type GenerationParams,
  type HistoryItem,
  type Voice,
} from "@/lib/api";
import { estimateSeconds, formatSeconds } from "@/lib/format";
import { DEFAULT_PARAMS, SAMPLE_TEXTS } from "@/lib/presets";

import { AmbientBackground } from "./ambient-background";
import { Composer, type Job } from "./composer";
import { Footer } from "./footer";
import { Header } from "./header";
import { Hero } from "./hero";
import { HistoryList } from "./history-list";
import { ResultPlayer } from "./result-player";
import { SettingsPanel } from "./settings-panel";
import { SetupGuide } from "./setup-guide";
import { VoicePanel } from "./voice-panel";

const DEFAULT_TEXT = SAMPLE_TEXTS[0].text;
const NO_VOICE: string | null = null;

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

export function Studio() {
  const { health, reachable, refresh } = useHealth();
  const [text, setText] = useLocalStorage("ava:text", DEFAULT_TEXT);
  const [params, setParams] = useLocalStorage<GenerationParams>("ava:params", DEFAULT_PARAMS);
  const [voiceId, setVoiceId] = useLocalStorage("ava:voice", NO_VOICE);

  const [voices, setVoices] = React.useState<Voice[]>([]);
  const [history, setHistory] = React.useState<HistoryItem[]>([]);
  const [analysis, setAnalysis] = React.useState<{ text: string; spell: boolean; data: Analysis } | null>(null);
  const [job, setJob] = React.useState<Job | null>(null);
  const [current, setCurrent] = React.useState<HistoryItem | null>(null);
  const [autoPlayId, setAutoPlayId] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const status = health?.status;
  const maxChars = health?.max_text_chars ?? 5000;

  // ---- data from the local server -------------------------------------------------
  const loadVoices = React.useCallback(() => api.voices().then(setVoices).catch(() => undefined), []);
  const loadHistory = React.useCallback(() => api.history().then(setHistory).catch(() => undefined), []);

  React.useEffect(() => {
    if (!reachable) return;
    void loadVoices();
    void loadHistory();
  }, [reachable, status, loadVoices, loadHistory]);

  const selectedVoice =
    voices.find((v) => v.id === voiceId) ?? voices.find((v) => v.kind === "builtin") ?? voices[0] ?? null;

  // ---- live text analysis (normalization + chunking preview), debounced -----------
  React.useEffect(() => {
    if (!reachable || !text.trim()) return;
    const controller = new AbortController();
    const spell = params.spell_numbers;
    const timer = setTimeout(() => {
      api
        .analyze(text, spell, controller.signal)
        .then((data) => setAnalysis({ text, spell, data }))
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, params.spell_numbers, reachable]);

  const fresh =
    analysis && analysis.text === text && analysis.spell === params.spell_numbers ? analysis.data : null;
  const previewChunks = text.trim() ? (fresh ?? analysis?.data)?.chunks ?? [] : [];
  const seconds = fresh?.estimated_seconds ?? estimateSeconds(text);

  const disabledReason =
    reachable === false
      ? "سرور محلی آوا اجرا نیست"
      : reachable === null
        ? "در حال اتصال به سرور…"
        : status === "missing_models"
          ? "ابتدا مدل را نصب کنید"
          : status === "error"
            ? "مدل بارگذاری نشد"
            : status !== "ready"
              ? "مدل در حال بارگذاری است…"
              : !text.trim()
                ? "متنی برای خواندن بنویسید"
                : text.length > maxChars
                  ? "متن از حد مجاز طولانی‌تر است"
                  : !selectedVoice
                    ? "یک صدا انتخاب کنید"
                    : null;

  // ---- synthesis ------------------------------------------------------------------
  const generate = async () => {
    if (disabledReason || job || !selectedVoice) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setJob({
      phase: "running",
      chunks: previewChunks,
      completed: 0,
      total: Math.max(1, previewChunks.length),
      startedAt: Date.now(),
    });
    try {
      await synthesize(
        { ...params, text, voice_id: selectedVoice.id },
        (event) => {
          switch (event.type) {
            case "queued":
              setJob((j) => j && { ...j, phase: "queued" });
              break;
            case "start":
              setJob((j) => j && { ...j, phase: "running", chunks: event.chunks, total: event.total, completed: 0 });
              break;
            case "progress":
              setJob(
                (j) =>
                  j && {
                    ...j,
                    completed: event.index + 1,
                    phase: event.index + 1 >= event.total ? "finishing" : "running",
                  },
              );
              break;
            case "done": {
              const item: HistoryItem = event;
              setCurrent(item);
              setAutoPlayId(item.id);
              setHistory((items) => [item, ...items.filter((x) => x.id !== item.id)]);
              toast.success("صدا آماده شد", {
                description: `${formatSeconds(item.duration)} با صدای ${item.voice_name}`,
              });
              break;
            }
            case "error":
              throw new ApiError(event.message, 500);
          }
        },
        controller.signal,
      );
    } catch (error) {
      if (isAbort(error)) {
        toast("ساخت صدا لغو شد");
      } else {
        toast.error("ساخت صدا ناموفق بود", { description: error instanceof Error ? error.message : undefined });
        if (error instanceof ApiError && error.status === 0) refresh();
      }
    } finally {
      abortRef.current = null;
      setJob(null);
    }
  };

  const cancel = () => abortRef.current?.abort();

  // ⌘/Ctrl + Enter generates from anywhere; Esc cancels a running job.
  const onShortcut = React.useEffectEvent((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void generate();
    } else if (event.key === "Escape" && abortRef.current) {
      cancel();
    }
  });
  React.useEffect(() => {
    const listener = (event: KeyboardEvent) => onShortcut(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // ---- voices & history actions -----------------------------------------------------
  const onVoiceCreated = (voice: Voice) => {
    setVoices((list) => [...list.filter((v) => v.id !== voice.id), voice]);
    setVoiceId(voice.id);
    void loadVoices();
  };

  const onVoiceDelete = async (id: string) => {
    try {
      await api.deleteVoice(id);
      setVoices((list) => list.filter((v) => v.id !== id));
      if (voiceId === id) setVoiceId(null);
      toast("صدا حذف شد");
    } catch (error) {
      toast.error("حذف صدا ناموفق بود", { description: error instanceof Error ? error.message : undefined });
    }
  };

  const openHistory = (item: HistoryItem) => {
    setCurrent(item);
    setAutoPlayId(item.id);
    requestAnimationFrame(() =>
      document.getElementById("player")?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  };

  const deleteHistory = async (item: HistoryItem) => {
    try {
      await api.deleteHistory(item.id);
      setHistory((items) => items.filter((x) => x.id !== item.id));
      if (current?.id === item.id) setCurrent(null);
    } catch (error) {
      toast.error("حذف ناموفق بود", { description: error instanceof Error ? error.message : undefined });
    }
  };

  const retryModel = async () => {
    try {
      await api.reload();
    } catch {
      /* health polling reports the state */
    }
    refresh();
  };

  return (
    <div className="relative isolate min-h-dvh">
      <AmbientBackground />
      <Header health={health} reachable={reachable} busy={job !== null} />
      <Hero />

      <div className="px-4 sm:px-6">
        <SetupGuide health={health} reachable={reachable} onRetry={retryModel} />
      </div>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,384px)] lg:items-start">
        {/* Phones: composer → voice & settings → player → history. Desktop: two columns. */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <div className="order-1 lg:order-none">
            <Composer
              text={text}
              onTextChange={setText}
              spellNumbers={params.spell_numbers}
              onSpellNumbersChange={(spell_numbers) => setParams({ ...params, spell_numbers })}
              maxChars={maxChars}
              previewChunks={previewChunks}
              seconds={seconds}
              job={job}
              disabledReason={disabledReason}
              onGenerate={() => void generate()}
              onCancel={cancel}
            />
          </div>

          <AnimatePresence>
            {current && (
              <motion.div
                id="player"
                key="player"
                className="order-3 scroll-mt-24 lg:order-none"
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ type: "spring", stiffness: 240, damping: 26 }}
              >
                <ResultPlayer key={current.id} item={current} autoPlay={autoPlayId === current.id} />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="order-4 lg:order-none">
            <HistoryList items={history} currentId={current?.id ?? null} onOpen={openHistory} onDelete={deleteHistory} />
          </div>
        </div>

        <aside className="order-2 flex min-w-0 flex-col gap-6 lg:order-none">
          <VoicePanel
            voices={voices}
            selectedId={selectedVoice?.id ?? null}
            onSelect={setVoiceId}
            onCreated={onVoiceCreated}
            onDelete={onVoiceDelete}
            available={status === "ready"}
          />
          <SettingsPanel params={params} onChange={setParams} device={health?.device ?? null} />
        </aside>
      </main>

      <Footer />
    </div>
  );
}
