"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const THEME_ORDER = ["light", "dark", "system"] as const;
type ThemeOption = (typeof THEME_ORDER)[number];

const THEME_ICONS: Record<ThemeOption, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

function nextTheme(current: ThemeOption): ThemeOption {
  const index = THEME_ORDER.indexOf(current);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length];
}

// Client-only mount detection via useSyncExternalStore (no store to
// subscribe to — it never notifies of changes — but the server/client
// snapshot mismatch is exactly what React uses to trigger the one-time
// post-hydration re-render). Avoids the setState-in-effect anti-pattern of
// the classic `useState(false)` + `useEffect(() => setTrue())` idiom.
function subscribeNever() {
  return () => {};
}
function getClientSnapshot() {
  return true;
}
function getServerSnapshot() {
  return false;
}

/**
 * Compact button cycling light -> dark -> system. Mounted in the
 * authenticated app header next to ModeToggle. Independent from the
 * office/field density axis (see mode-toggle.tsx).
 */
export function ThemeToggle() {
  const t = useTranslations("common.theme");
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeNever,
    getClientSnapshot,
    getServerSnapshot,
  );

  const current: ThemeOption =
    theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : "system";
  // Before mount the server can't know the persisted theme, so it always
  // renders "system"; the label/title must match that until mounted or the
  // aria-label/title mismatch trips a hydration error.
  const shown: ThemeOption = mounted ? current : "system";
  const Icon = THEME_ICONS[shown];

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(nextTheme(current))}
      aria-label={t("toggleLabel", { current: t(shown) })}
      title={t("toggleLabel", { current: t(shown) })}
    >
      {mounted ? <Icon /> : <span className="size-3.5" />}
    </Button>
  );
}
