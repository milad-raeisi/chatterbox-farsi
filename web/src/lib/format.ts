const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Latin digits → Persian digits; a decimal point between digits becomes «٫». */
export function toFa(value: string | number): string {
  return String(value)
    .replace(/(\d)\.(\d)/g, "$1٫$2")
    .replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return toFa(`${m}:${s.toString().padStart(2, "0")}`);
}

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${toFa(seconds < 10 ? seconds.toFixed(1) : Math.round(seconds))} ثانیه`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${toFa(m)} دقیقه و ${toFa(s)} ثانیه` : `${toFa(m)} دقیقه`;
}

const relative = new Intl.RelativeTimeFormat("fa", { numeric: "auto" });

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const diff = (new Date(iso).getTime() - now) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.35],
    ["month", 12],
    ["year", Infinity],
  ];
  let value = diff;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return relative.format(Math.round(value), unit);
    value /= size;
  }
  return "";
}

/** Rough speaking time for Persian when the server can't be asked (~13 letters per second). */
export function estimateSeconds(text: string): number {
  return Math.round((text.replace(/\s/g, "").length / 13) * 10) / 10;
}
