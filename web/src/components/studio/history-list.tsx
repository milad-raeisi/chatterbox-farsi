"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";

import { Clock } from "@/components/animate-ui/icons/clock";
import { Download } from "@/components/animate-ui/icons/download";
import { Play } from "@/components/animate-ui/icons/play";
import { Trash2 } from "@/components/animate-ui/icons/trash-2";
import { FaNumber } from "@/components/fa-number";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, type HistoryItem } from "@/lib/api";
import { formatClock, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Panel } from "./panel";

const PAGE = 6;

function RowAction({
  label,
  onClick,
  href,
  className,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const classes = cn(
    "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-4",
    className,
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <a href={href} download aria-label={label} className={classes}>
            {children}
          </a>
        ) : (
          <button type="button" aria-label={label} onClick={onClick} className={classes}>
            {children}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function HistoryRow({
  item,
  active,
  onOpen,
  onDelete,
}: {
  item: HistoryItem;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = React.useState(false);
  React.useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(id);
  }, [confirming]);

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-background/60",
        active && "bg-primary/[0.07]",
      )}
    >
      <motion.button
        type="button"
        onClick={onOpen}
        whileTap={{ scale: 0.9 }}
        aria-label="باز کردن در پخش‌کننده"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/60 text-primary transition-colors hover:border-primary/50 hover:bg-primary hover:text-primary-foreground",
          active && "border-primary bg-primary text-primary-foreground",
        )}
      >
        <Play size={16} animateOnHover />
      </motion.button>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
        <p dir="auto" className="line-clamp-1 text-sm">
          {item.text}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.voice_name} · {formatClock(item.duration)} · {timeAgo(item.created_at)}
        </p>
      </button>
      <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <RowAction label="دانلود" href={api.downloadUrl(item)}>
          <Download animateOnHover />
        </RowAction>
        <RowAction
          label={confirming ? "برای حذف دوباره بزنید" : "حذف"}
          className={cn(confirming && "bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive")}
          onClick={() => (confirming ? onDelete() : setConfirming(true))}
        >
          <Trash2 animateOnHover animate={confirming} />
        </RowAction>
      </div>
    </div>
  );
}

export function HistoryList({
  items,
  currentId,
  onOpen,
  onDelete,
}: {
  items: HistoryItem[];
  currentId: string | null;
  onOpen: (item: HistoryItem) => void;
  onDelete: (item: HistoryItem) => void;
}) {
  const [limit, setLimit] = React.useState(PAGE);
  const visible = items.slice(0, limit);

  return (
    <Panel
      title="تاریخچه"
      icon={<Clock animateOnHover />}
      actions={
        items.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <FaNumber value={items.length} /> فایل
          </span>
        )
      }
    >
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm leading-7 text-muted-foreground">
          صداهایی که می‌سازید اینجا ذخیره می‌شوند؛ روی همین دستگاه، در پوشهٔ <span dir="ltr">backend/data</span>.
        </div>
      ) : (
        <>
          <ul className="-mx-2.5 space-y-0.5">
            <AnimatePresence initial={false}>
              {visible.map((item) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
                >
                  <HistoryRow
                    item={item}
                    active={item.id === currentId}
                    onOpen={() => onOpen(item)}
                    onDelete={() => onDelete(item)}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {items.length > limit && (
            <Button variant="ghost" className="mt-2 w-full rounded-md text-xs" onClick={() => setLimit((l) => l + PAGE)}>
              نمایش موارد بیشتر
            </Button>
          )}
        </>
      )}
    </Panel>
  );
}
