"use client";

import { useRef, useState } from "react";
import { Check, Moon, Palette } from "lucide-react";
import DropdownPanel from "@/components/ui/DropdownPanel";
import { useTheme } from "@/hooks/useTheme";
import {
  COLOR_ACCENT_THEME_OPTIONS,
  type AccentTheme,
} from "@/lib/ui-theme";
import { cn } from "@/lib/utils";

export default function ThemePicker({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active =
    COLOR_ACCENT_THEME_OPTIONS.find((row) => row.id === theme) ??
    COLOR_ACCENT_THEME_OPTIONS[0];
  const darkSelected = theme === "dark";

  const selectTheme = (next: AccentTheme) => {
    setTheme(next);
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Theme: ${darkSelected ? "Dark Theme" : active.label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Theme"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
      >
        <span className="relative inline-flex h-5 w-5 items-center justify-center">
          {darkSelected ? <Moon className="h-4 w-4" /> : <Palette className="h-4 w-4" />}
          <span
            className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white"
            style={{ backgroundColor: darkSelected ? "#0B1220" : active.swatch }}
          />
        </span>
      </button>

      <DropdownPanel
        open={open}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
        matchTriggerWidth={false}
        minWidth={220}
        maxHeight={240}
        className="p-2"
      >
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Accent theme
        </p>
        <div className="flex items-center justify-between gap-1.5">
          {COLOR_ACCENT_THEME_OPTIONS.map((option) => {
            const selected = option.id === theme;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => selectTheme(option.id)}
                title={option.label}
                aria-label={option.label}
                aria-pressed={selected}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 transition",
                  selected ? "border-slate-800" : "border-transparent hover:border-slate-300"
                )}
                style={{ backgroundColor: option.swatch }}
              >
                {selected ? (
                  <Check
                    className={cn(
                      "h-4 w-4",
                      option.checkOnSwatch === "white" ? "text-white" : "text-[#1F2429]"
                    )}
                    strokeWidth={3}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <p className="mb-2 mt-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Appearance
        </p>
        <button
          type="button"
          onClick={() => selectTheme("dark")}
          aria-pressed={darkSelected}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm font-semibold transition",
            darkSelected
              ? "border-orange-400 bg-orange-50 text-orange-700"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          )}
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#0B1220] text-white">
            <Moon className="h-3.5 w-3.5" />
          </span>
          Dark Theme
          {darkSelected ? <Check className="ml-auto h-4 w-4" strokeWidth={3} /> : null}
        </button>
      </DropdownPanel>
    </div>
  );
}
