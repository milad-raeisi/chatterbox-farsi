import * as React from "react";

import { cn } from "@/lib/utils";

type PanelProps = Omit<React.ComponentProps<"section">, "title"> & {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
};

/** Frosted-glass card used by every block of the studio. */
export function Panel({ title, icon, actions, className, children, ...props }: PanelProps) {
  return (
    <section className={cn("glass rounded-3xl border border-border/70", className)} {...props}>
      {(title || actions) && (
        <header className="flex items-center gap-2.5 px-5 pt-5 pb-3">
          {icon && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary [&_svg]:size-[18px]">
              {icon}
            </span>
          )}
          {title && <h2 className="text-[15px] font-bold">{title}</h2>}
          {actions && <div className="ms-auto flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}
