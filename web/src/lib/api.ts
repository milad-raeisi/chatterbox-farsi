// Client for the local Ava server. Every request goes to this machine only.
// In production the UI is served by the same server (same origin); in `next dev` it talks to
// http://127.0.0.1:8000 (see .env.development).
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const apiUrl = (path: string) => `${API_BASE}${path}`;

export type EngineStatus = "idle" | "loading" | "ready" | "missing_models" | "error";

export interface Health {
  status: EngineStatus;
  stage: string;
  error: string | null;
  device: string | null;
  device_name: string | null;
  sample_rate: number;
  load_seconds: number | null;
  missing_files: string[];
  model_dir: string;
  offline: boolean;
  max_text_chars: number;
  version: string;
  model_url: string;
}

export interface Voice {
  id: string;
  name: string;
  kind: "builtin" | "custom";
  duration: number;
  gender?: string | null;
  created_at?: string | null;
}

export interface GenerationParams {
  exaggeration: number;
  cfg_weight: number;
  temperature: number;
  pause_ms: number;
  seed: number | null;
  spell_numbers: boolean;
}

export interface HistoryItem {
  id: string;
  url: string;
  text: string;
  voice_id: string;
  voice_name: string;
  duration: number;
  elapsed: number;
  rtf: number | null;
  chunks: number;
  device: string | null;
  created_at: string;
  params: Partial<GenerationParams> & { voice_id?: string };
}

export interface Analysis {
  normalized: string;
  chunks: string[];
  characters: number;
  estimated_seconds: number;
}

export type TTSEvent =
  | { type: "queued" }
  | { type: "start"; total: number; chunks: string[] }
  | { type: "progress"; index: number; total: number; audio_seconds: number; elapsed: number }
  | ({ type: "done" } & HistoryItem)
  | { type: "error"; message: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const UNREACHABLE = "سرور محلی آوا در دسترس نیست.";

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) return "مقدار واردشده معتبر نیست.";
  } catch {
    /* not JSON */
  }
  return `خطای سرور (${res.status})`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { cache: "no-store", ...init });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(UNREACHABLE, 0);
  }
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: (signal?: AbortSignal) => request<Health>("/api/health", { signal }),
  reload: () => request<{ started: boolean; status: EngineStatus }>("/api/engine/reload", { method: "POST" }),
  voices: () => request<Voice[]>("/api/voices"),
  addVoice(wav: Blob, name: string) {
    const form = new FormData();
    form.append("file", wav, "voice.wav");
    form.append("name", name);
    form.append("consent", "true");
    return request<Voice>("/api/voices", { method: "POST", body: form });
  },
  deleteVoice: (id: string) => request<void>(`/api/voices/${encodeURIComponent(id)}`, { method: "DELETE" }),
  history: () => request<HistoryItem[]>("/api/history"),
  deleteHistory: (id: string) => request<void>(`/api/history/${encodeURIComponent(id)}`, { method: "DELETE" }),
  analyze: (text: string, spellNumbers: boolean, signal?: AbortSignal) =>
    request<Analysis>("/api/text/analyze", { ...json({ text, spell_numbers: spellNumbers }), signal }),
  voiceAudioUrl: (id: string) => apiUrl(`/api/voices/${encodeURIComponent(id)}/audio`),
  audioUrl: (item: Pick<HistoryItem, "url">) => apiUrl(item.url),
  downloadUrl: (item: Pick<HistoryItem, "url">) => apiUrl(`${item.url}?download=true`),
};

/** POST /api/tts and feed each NDJSON progress event to `onEvent` as it arrives. */
export async function synthesize(
  body: GenerationParams & { text: string; voice_id: string },
  onEvent: (event: TTSEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(apiUrl("/api/tts"), { ...json(body), signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(UNREACHABLE, 0);
  }
  if (!res.ok || !res.body) throw new ApiError(await readError(res), res.status);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as TTSEvent);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as TTSEvent);
}
