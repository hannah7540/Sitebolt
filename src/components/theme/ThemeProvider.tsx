"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ThemeContext } from "./theme-context";
import {
  applyAccentThemeToDocument,
  parseAccentTheme,
  readStoredAccentTheme,
  UI_THEME_STORAGE_KEY,
  writeStoredAccentTheme,
  type AccentTheme,
} from "@/lib/ui-theme";
import { persistWorkerUiTheme, readWorkerUiTheme } from "@/lib/ui-theme-persist";

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AccentTheme>(readStoredAccentTheme);

  useLayoutEffect(() => {
    applyAccentThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromWorkerRow() {
      const stored = readStoredAccentTheme();
      applyAccentThemeToDocument(stored);
      setThemeState(stored);

      const remote = await readWorkerUiTheme();
      if (cancelled || !remote) return;
      if (window.localStorage.getItem(UI_THEME_STORAGE_KEY)) return;
      writeStoredAccentTheme(remote);
      applyAccentThemeToDocument(remote);
      setThemeState(remote);
    }

    void hydrateFromWorkerRow();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== UI_THEME_STORAGE_KEY) return;
      const next = parseAccentTheme(event.newValue);
      applyAccentThemeToDocument(next);
      setThemeState(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((next: AccentTheme) => {
    writeStoredAccentTheme(next);
    applyAccentThemeToDocument(next);
    setThemeState(next);
    void persistWorkerUiTheme(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
