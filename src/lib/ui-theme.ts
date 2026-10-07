export const UI_THEME_STORAGE_KEY = "sitebolt_theme";

export const ACCENT_THEMES = ["orange", "blue", "green", "pink", "yellow"] as const;

export type AccentTheme = (typeof ACCENT_THEMES)[number];

export const DEFAULT_ACCENT_THEME: AccentTheme = "orange";

export interface AccentThemeOption {
  id: AccentTheme;
  label: string;
  /** Picker swatch (requested light family color). */
  swatch: string;
  /** Solid fill used under white text (contrast-safe). */
  accent: string;
  hover: string;
  checkOnSwatch: "white" | "charcoal";
}

export const ACCENT_THEME_OPTIONS: AccentThemeOption[] = [
  {
    id: "orange",
    label: "Orange",
    swatch: "#FF6B00",
    accent: "#FF6B00",
    hover: "#E85F00",
    checkOnSwatch: "white",
  },
  {
    id: "blue",
    label: "Blue",
    swatch: "#38BDF8",
    accent: "#0284C7",
    hover: "#0369A1",
    checkOnSwatch: "charcoal",
  },
  {
    id: "green",
    label: "Green",
    swatch: "#4ADE80",
    accent: "#16A34A",
    hover: "#15803D",
    checkOnSwatch: "charcoal",
  },
  {
    id: "pink",
    label: "Pink",
    swatch: "#F472B6",
    accent: "#DB2777",
    hover: "#BE185D",
    checkOnSwatch: "white",
  },
  {
    id: "yellow",
    label: "Yellow",
    swatch: "#FACC15",
    accent: "#CA8A04",
    hover: "#A16207",
    checkOnSwatch: "charcoal",
  },
];

const THEME_CLASS_LIST = ACCENT_THEMES.map((theme) => `theme-${theme}`);

export function isAccentTheme(value: string | null | undefined): value is AccentTheme {
  return Boolean(value) && ACCENT_THEMES.includes(value as AccentTheme);
}

export function parseAccentTheme(value: string | null | undefined): AccentTheme {
  return isAccentTheme(value) ? value : DEFAULT_ACCENT_THEME;
}

export function readStoredAccentTheme(): AccentTheme {
  if (typeof window === "undefined") return DEFAULT_ACCENT_THEME;
  try {
    return parseAccentTheme(window.localStorage.getItem(UI_THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_ACCENT_THEME;
  }
}

export function writeStoredAccentTheme(theme: AccentTheme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode / quota — CSS class still applies for this session.
  }
}

export function applyAccentThemeToDocument(theme: AccentTheme): void {
  if (typeof document === "undefined") return;
  const option = ACCENT_THEME_OPTIONS.find((row) => row.id === theme) ?? ACCENT_THEME_OPTIONS[0];
  const root = document.documentElement;
  root.classList.remove(...THEME_CLASS_LIST);
  root.classList.add(`theme-${theme}`);
  root.setAttribute("data-theme", theme);
  root.style.setProperty("--primary-accent", option.accent);
  root.style.setProperty("--primary-accent-hover", option.hover);
}

/** Runs before paint so the stored accent is visible on first frame. */
export const UI_THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k=${JSON.stringify(UI_THEME_STORAGE_KEY)};var a=${JSON.stringify([...ACCENT_THEMES])};var t=localStorage.getItem(k);if(a.indexOf(t)<0)t=${JSON.stringify(DEFAULT_ACCENT_THEME)};var r=document.documentElement;r.classList.remove(${THEME_CLASS_LIST.map((c) => JSON.stringify(c)).join(",")});r.classList.add("theme-"+t);r.setAttribute("data-theme",t);}catch(e){document.documentElement.classList.add("theme-${DEFAULT_ACCENT_THEME}");}})();`;
