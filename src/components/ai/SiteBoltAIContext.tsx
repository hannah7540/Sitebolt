"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SiteBoltAIContextValue {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
  toggleModal: () => void;
}

const SiteBoltAIContext = createContext<SiteBoltAIContextValue | null>(null);

export function SiteBoltAIProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);
  const toggleModal = useCallback(() => setOpen((current) => !current), []);

  const value = useMemo(
    () => ({ open, openModal, closeModal, toggleModal }),
    [open, openModal, closeModal, toggleModal]
  );

  return (
    <SiteBoltAIContext.Provider value={value}>{children}</SiteBoltAIContext.Provider>
  );
}

export function useSiteBoltAI(): SiteBoltAIContextValue {
  const value = useContext(SiteBoltAIContext);
  if (!value) {
    return {
      open: false,
      openModal: () => undefined,
      closeModal: () => undefined,
      toggleModal: () => undefined,
    };
  }
  return value;
}
