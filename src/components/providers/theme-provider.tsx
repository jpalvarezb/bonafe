"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Thin wrapper around next-themes' ThemeProvider, mounted in the root
 * [locale] layout. Manages the light/dark axis by toggling the `dark`
 * class on <html> (matches the `@custom-variant dark (&:is(.dark *))` in
 * globals.css). Independent from the office/field density axis, which is
 * handled separately by ModeProvider.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
