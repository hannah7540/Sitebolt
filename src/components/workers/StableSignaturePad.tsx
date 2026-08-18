"use client";

import React, { useCallback, useEffect, useRef } from "react";
import IsolatedSignaturePad from "@/components/prestart/IsolatedSignaturePad";

const StableSignaturePad = React.memo(
  ({ onChange }: { onChange: (base64: string) => void }) => {
    const onChangeRef = useRef(onChange);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    const handleCommit = useCallback((dataUrl: string | null) => {
      if (dataUrl) {
        onChangeRef.current(dataUrl);
      }
    }, []);

    return <IsolatedSignaturePad onCommit={handleCommit} />;
  }
);

StableSignaturePad.displayName = "StableSignaturePad";

interface StableSignatureFieldProps {
  fieldId: string;
  onCommit: (fieldId: string, base64: string) => void;
}

/** Keeps a stable `onChange` reference so `StableSignaturePad` is not re-mounted by parent renders. */
const StableSignatureField = React.memo(function StableSignatureField({
  fieldId,
  onCommit,
}: StableSignatureFieldProps) {
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const handleChange = React.useCallback((base64: string) => {
    onCommitRef.current(fieldId, base64);
  }, [fieldId]);

  return <StableSignaturePad onChange={handleChange} />;
});

StableSignatureField.displayName = "StableSignatureField";

export { StableSignaturePad, StableSignatureField };
