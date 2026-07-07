"use client";

import { Rows3, Tractor } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useMode } from "@/components/providers/mode-provider";

/**
 * Toggles the office/field density axis (data-mode on <html>). Independent
 * from ThemeToggle's light/dark axis. Density tokens themselves aren't
 * applied to any existing screens yet — this is infrastructure for the
 * upcoming component migration pass.
 */
export function ModeToggle() {
  const t = useTranslations("common.mode");
  const { mode, toggleMode } = useMode();
  const Icon = mode === "office" ? Rows3 : Tractor;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={toggleMode}
      aria-label={t("toggleLabel", { current: t(mode) })}
      title={t("toggleLabel", { current: t(mode) })}
    >
      <Icon />
    </Button>
  );
}
