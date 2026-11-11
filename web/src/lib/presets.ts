import type { GenerationParams } from "@/lib/api";

// Defaults are the values the model card used for its samples.
export const DEFAULT_PARAMS: GenerationParams = {
  exaggeration: 0.5,
  cfg_weight: 0.5,
  temperature: 0.8,
  pause_ms: 250,
  seed: null,
  spell_numbers: true,
};

export type StyleValues = Pick<GenerationParams, "exaggeration" | "cfg_weight" | "temperature">;

export const STYLE_PRESETS: { id: string; label: string; hint: string; values: StyleValues }[] = [
  {
    id: "balanced",
    label: "متعادل",
    hint: "همان تنظیمات پیش‌فرض مدل",
    values: { exaggeration: 0.5, cfg_weight: 0.5, temperature: 0.8 },
  },
  {
    id: "calm",
    label: "آرام",
    hint: "شمرده و آرام؛ مناسب کتاب صوتی",
    values: { exaggeration: 0.35, cfg_weight: 0.3, temperature: 0.7 },
  },
  {
    id: "lively",
    label: "پرانرژی",
    hint: "پرهیجان و رسا؛ مناسب تبلیغ و تیزر",
    values: { exaggeration: 0.9, cfg_weight: 0.4, temperature: 0.85 },
  },
  {
    id: "steady",
    label: "یکنواخت",
    hint: "کم‌نوسان و قابل پیش‌بینی؛ مناسب اطلاع‌رسانی",
    values: { exaggeration: 0.4, cfg_weight: 0.55, temperature: 0.5 },
  },
];

export function matchPreset(params: GenerationParams): string | null {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.001;
  const preset = STYLE_PRESETS.find(
    ({ values: v }) =>
      near(v.exaggeration, params.exaggeration) &&
      near(v.cfg_weight, params.cfg_weight) &&
      near(v.temperature, params.temperature),
  );
  return preset?.id ?? null;
}

export const SAMPLE_TEXTS: { id: string; label: string; text: string }[] = [
  {
    id: "greeting",
    label: "احوال‌پرسی",
    text: "سلام! امروز هوا خیلی خوب است، بیا با هم به پارک برویم.",
  },
  {
    id: "story",
    label: "داستان",
    text: "روزی روزگاری، در دهکده‌ای کوچک کنار کوه‌های البرز، پیرمردی مهربان زندگی می‌کرد. هر روز صبح زود، پیش از طلوع آفتاب، به باغ کوچکش می‌رفت و به درختان سیب آب می‌داد.",
  },
  {
    id: "news",
    label: "خبر",
    text: "به گزارش خبرنگار ما، نمایشگاه بین‌المللی کتاب از ۱۵ اردیبهشت آغاز به کار می‌کند. در این دوره بیش از ۲۵۰۰ ناشر داخلی و خارجی حضور دارند.",
  },
  {
    id: "poem",
    label: "شعر",
    text: "توانا بود هر که دانا بود، ز دانش دل پیر برنا بود.",
  },
  {
    id: "assistant",
    label: "یادآوری",
    text: "یادآوری: جلسهٔ تیم ساعت ۳ بعدازظهر برگزار می‌شود. لطفاً گزارش هفتگی را پیش از جلسه بفرستید.",
  },
];

export const CLONE_PROMPT =
  "سلام، این نمونهٔ صدای من است. امروز می‌خواهم چند جمله را با آرامش و وضوح بخوانم تا آوا بتواند صدایم را یاد بگیرد.";
