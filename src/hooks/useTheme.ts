"use client";

import { useContext } from "react";
import {
  ThemeContext,
  type ThemeContextValue,
} from "@/components/theme/theme-context";
import { DEFAULT_ACCENT_THEME } from "@/lib/ui-theme";

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value) return value;

  return {
    theme: DEFAULT_ACCENT_THEME,
    setTheme: () => {},
  };
}
