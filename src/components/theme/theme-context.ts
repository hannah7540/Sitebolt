"use client";

import { createContext } from "react";
import type { AccentTheme } from "@/lib/ui-theme";

export interface ThemeContextValue {
  theme: AccentTheme;
  setTheme: (theme: AccentTheme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
