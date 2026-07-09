"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small collapsible primitive for the cockpit rail — direct port of the
 * chevron idiom in src/components/app-shell/sidebar-nav.tsx's section
 * toggle (mono uppercase microlabel + rotating chevron, aria-expanded +
 * aria-controls, conditional unmount of children). Session-only expansion
 * state, default expanded — no localStorage, same as the sidebar.
 */
export function RailSection({
  title,
  defaultExpanded = true,
  children,
}: {
  readonly title: string;
  readonly defaultExpanded?: boolean;
  readonly children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = useId();

  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls={contentId}
        className="flex w-full items-center gap-1 px-3.5 pt-2.5 pb-1 text-left font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 motion-safe:transition-transform motion-safe:duration-150",
            expanded && "rotate-90",
          )}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </button>
      {expanded && (
        <div id={contentId} className="pb-2">
          {children}
        </div>
      )}
    </div>
  );
}
