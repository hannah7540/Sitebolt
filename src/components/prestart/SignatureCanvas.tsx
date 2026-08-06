"use client";

import { memo } from "react";
import IsolatedSignaturePad from "./IsolatedSignaturePad";

interface SignatureCanvasProps {
  /** Called only when a stroke ends or the canvas is cleared — not during drawing. */
  onChange: (dataUrl: string | null) => void;
  /** Restored once on mount; not synced on subsequent parent re-renders. */
  value?: string | null;
}

function SignatureCanvas({ onChange, value = null }: SignatureCanvasProps) {
  return <IsolatedSignaturePad defaultValue={value} onCommit={onChange} />;
}

export default memo(SignatureCanvas);
