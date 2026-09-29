"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import CommandPalette from "@/components/command-palette/CommandPalette";

interface CommandPaletteContextValue {
  isOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null
);

export function useCommandPalette(): CommandPaletteContextValue | null {
  return useContext(CommandPaletteContext);
}

export default function CommandPaletteProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const openPalette = useCallback(() => setIsOpen(true), []);
  const closePalette = useCallback(() => setIsOpen(false), []);
  const togglePalette = useCallback(() => setIsOpen((open) => !open), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setIsOpen((open) => !open);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    () => ({ isOpen, openPalette, closePalette, togglePalette }),
    [isOpen, openPalette, closePalette, togglePalette]
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {isOpen ? <CommandPalette onClose={closePalette} /> : null}
    </CommandPaletteContext.Provider>
  );
}
