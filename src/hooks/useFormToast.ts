"use client";

import { useCallback, useState } from "react";
import type { ToastVariant } from "@/components/ui/Toast";

export interface FormToastState {
  message: string;
  variant: ToastVariant;
}

export function useFormToast() {
  const [toast, setToast] = useState<FormToastState | null>(null);

  const showError = useCallback((message: string) => {
    setToast({ message, variant: "error" });
  }, []);

  const showSuccess = useCallback((message: string) => {
    setToast({ message, variant: "success" });
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  return { toast, showError, showSuccess, dismissToast };
}
