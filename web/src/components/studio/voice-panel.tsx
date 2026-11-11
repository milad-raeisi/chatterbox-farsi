"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";

import { Headphones } from "@/components/animate-ui/icons/headphones";
import { Mic } from "@/components/animate-ui/icons/mic";
import { Pause } from "@/components/animate-ui/icons/pause";
import { Play } from "@/components/animate-ui/icons/play";
import { Trash2 } from "@/components/animate-ui/icons/trash-2";
import { UserRound } from "@/components/animate-ui/icons/user-round";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, type Voice } from "@/lib/api";
import { formatSeconds, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Panel } from "./panel";
import { VoiceCloner } from "./voice-cloner";

const AVATAR: Record<string, string> = {
  female: "bg-primary",
  male: "bg-primary",
  custom: "bg-primary",
};

type Preview = { playingId: string | null; toggle: (id: string) => void };

/** Previews a reference voice. The <audio> exists only while playing: unmounting stops it. */
function usePreview(): Preview & { player: React.ReactNode } {
  const [playingId, setPlayingId] = React.useState<string | null>(null);
  const toggle = React.useCallback((id: string) => setPlayingId((current) => (current === id ? null : id)), []);
  const stop = () => setPlayingId(null);
  const player = playingId ? (
    <audio key={playingId} src={api.voiceAudioUrl(playingId)} autoPlay onEnded={stop} onError={stop} hidden />
  ) : null;
  return { playingId, toggle, player };
}

function radioKeys(onSelect: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };
}

function SelectionRing() {
  return (
    <motion.span
      layoutId="voice-selection"
      className="pointer-events-none absolute inset-0 rounded-lg border-2 border-primary bg-primary/[0.07]"
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
    />
  );
}

function VoiceCard({
  voice,
  selected,
  onSelect,
  preview,
}: {
  voice: Voice;
  selected: boolean;
  onSelect: () => void;
  preview: Preview;
}) {
  const playing = preview.playingId === voice.id;
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={radioKeys(onSelect)}
      className="group relative cursor-pointer rounded-lg border border-border/70 bg-background/40 p-3 outline-none transition-colors hover:bg-background/70 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {selected && <SelectionRing />}
      <div className="relative flex flex-col items-center gap-1.5 text-center">
        <div
          className={cn(
            "relative mb-1 flex size-14 items-center justify-center rounded-full text-xl font-black text-white",
            AVATAR[voice.gender ?? "custom"],
          )}
        >
          {voice.name.slice(0, 1)}
          {playing && (
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-primary"
              animate={{ scale: [1, 1.4], opacity: [0.8, 0] }}
              transition={{ repeat: Infinity, duration: 1.2, ease: "easeOut" }}
            />
          )}
        </div>
        <div className="font-bold">{voice.name}</div>
        <div className="text-xs text-muted-foreground">{voice.gender === "male" ? "صدای مرد" : "صدای زن"}</div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            preview.toggle(voice.id);
          }}
          className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/60 px-2.5 py-1 text-xs transition-colors hover:border-primary/40 hover:text-primary"
        >
          {playing ? <Pause size={13} /> : <Play size={13} animateOnHover />}
          {playing ? "توقف" : "شنیدن نمونه"}
        </button>
      </div>
    </div>
  );
}

function IconButton({
  label,
  className,
  onClick,
  children,
}: {
  label: string;
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          className={cn(
            "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4",
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CustomVoiceRow({
  voice,
  selected,
  onSelect,
  onDelete,
  preview,
}: {
  voice: Voice;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  preview: Preview;
}) {
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(id);
  }, [confirming]);
  const playing = preview.playingId === voice.id;

  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={radioKeys(onSelect)}
      className="relative flex cursor-pointer items-center gap-3 rounded-lg border border-border/70 bg-background/40 p-2.5 outline-none transition-colors hover:bg-background/70 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {selected && <SelectionRing />}
      <div
        className={cn(
          "relative flex size-10 shrink-0 items-center justify-center rounded-full font-bold text-white",
          AVATAR.custom,
        )}
      >
        {voice.name.slice(0, 1)}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{voice.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {formatSeconds(voice.duration)} · {timeAgo(voice.created_at)}
        </div>
      </div>
      <div className="relative flex items-center gap-0.5">
        <IconButton label={playing ? "توقف" : "شنیدن نمونه"} onClick={() => preview.toggle(voice.id)}>
          {playing ? <Pause /> : <Play animateOnHover />}
        </IconButton>
        <IconButton
          label={confirming ? "برای حذف دوباره بزنید" : "حذف صدا"}
          className={cn(confirming && "bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive")}
          onClick={() => (confirming ? onDelete() : setConfirming(true))}
        >
          <Trash2 animateOnHover animate={confirming} />
        </IconButton>
      </div>
    </div>
  );
}

export function VoicePanel({
  voices,
  selectedId,
  onSelect,
  onCreated,
  onDelete,
  available,
}: {
  voices: Voice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: (voice: Voice) => void;
  onDelete: (id: string) => void;
  available: boolean;
}) {
  const [tab, setTab] = React.useState("library");
  const preview = usePreview();
  const builtins = voices.filter((v) => v.kind === "builtin");
  const custom = voices.filter((v) => v.kind === "custom");

  return (
    <Panel title="صدا" icon={<UserRound animateOnHover />}>
      {preview.player}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-10 w-full grid-cols-2">
          <TabsTrigger value="library">
            <Headphones size={16} animateOnHover />
            صداها
          </TabsTrigger>
          <TabsTrigger value="clone">
            <Mic size={16} animateOnHover />
            صدای خودتان
          </TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="mt-3">
          {voices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm leading-7 text-muted-foreground">
              {available
                ? "هنوز صدایی در دسترس نیست."
                : "صداهای آماده پس از اجرای سرور و نصب مدل اینجا نمایش داده می‌شوند."}
            </div>
          ) : (
            <div role="radiogroup" aria-label="انتخاب صدا" className="space-y-4">
              {builtins.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {builtins.map((voice) => (
                    <VoiceCard
                      key={voice.id}
                      voice={voice}
                      selected={voice.id === selectedId}
                      onSelect={() => onSelect(voice.id)}
                      preview={preview}
                    />
                  ))}
                </div>
              )}
              {custom.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">صداهای شما</div>
                  <ul className="space-y-2">
                    <AnimatePresence initial={false}>
                      {custom.map((voice) => (
                        <motion.li
                          key={voice.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
                        >
                          <CustomVoiceRow
                            voice={voice}
                            selected={voice.id === selectedId}
                            onSelect={() => onSelect(voice.id)}
                            onDelete={() => onDelete(voice.id)}
                            preview={preview}
                          />
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="clone" className="mt-3">
          <VoiceCloner
            disabled={!available}
            onCreated={(voice) => {
              onCreated(voice);
              setTab("library");
            }}
          />
        </TabsContent>
      </Tabs>
    </Panel>
  );
}
