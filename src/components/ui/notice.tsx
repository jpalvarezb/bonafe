import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NoticeVariant = "success" | "warning" | "error" | "info";

// Tailwind v4 requires statically analyzable class names — no dynamic
// `bg-notice-${variant}-bg` string construction. Every valid variant is
// spelled out explicitly here (mirrors the StatusChip pattern).
const NOTICE_CLASSES: Record<NoticeVariant, string> = {
  success:
    "bg-notice-success-bg text-notice-success-fg border-notice-success-border",
  warning:
    "bg-notice-warning-bg text-notice-warning-fg border-notice-warning-border",
  error: "bg-notice-error-bg text-notice-error-fg border-notice-error-border",
  info: "bg-notice-info-bg text-notice-info-fg border-notice-info-border",
};

/**
 * Page-level banner/alert block for success/warning/error/info notices. Does
 * NOT translate — callers pass already-translated content as children, and
 * keep any icons/links/structure they need inside.
 */
export function Notice({
  variant,
  children,
  className,
}: {
  variant: NoticeVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[3px] border px-4 py-3 text-sm font-medium",
        NOTICE_CLASSES[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}
