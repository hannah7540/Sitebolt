"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import IsolatedSignaturePad from "./IsolatedSignaturePad";

interface SignatureCanvasProps {
  /** Called only when a stroke ends or the canvas is cleared — not during drawing. */
  onChange: (dataUrl: string | null) => void;
  /** Restored once on mount; not synced on subsequent parent re-renders. */
  value?: string | null;
}

function SignatureCanvas({ onChange, value = null }: SignatureCanvasProps) {
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handleCommit = useCallback((dataUrl: string | null) => {
    onChangeRef.current(dataUrl);
  }, []);

  return (
    <IsolatedSignaturePad
      defaultValue={initialValueRef.current}
      onCommit={handleCommit}
    />
  );
}

export default memo(SignatureCanvas);
