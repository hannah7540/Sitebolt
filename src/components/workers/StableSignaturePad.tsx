"use client";

import React, { useEffect, useRef } from "react";

const StableSignaturePad = React.memo(
  ({ onChange }: { onChange: (base64: string) => void }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const isDrawing = useRef(false);
    const onChangeRef = useRef(onChange);

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set fixed coordinate dimensions once to prevent auto-clearing
      canvas.width = canvas.offsetWidth || 400;
      canvas.height = 150;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#000000";
    }, []);

    const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      isDrawing.current = true;
      const ctx = canvasRef.current?.getContext("2d");
      const { x, y } = getCoordinates(e);
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing.current) return;
      e.preventDefault();
      const ctx = canvasRef.current?.getContext("2d");
      const { x, y } = getCoordinates(e);
      if (ctx) {
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    };

    const stopDrawing = () => {
      if (!isDrawing.current) return;
      isDrawing.current = false;
      if (canvasRef.current) {
        onChangeRef.current(canvasRef.current.toDataURL("image/png"));
      }
    };

    return (
      <div style={{ touchAction: "none" }} className="rounded-md border bg-white p-2">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="block h-[150px] w-full cursor-crosshair"
          style={{ touchAction: "none" }}
        />
      </div>
    );
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
