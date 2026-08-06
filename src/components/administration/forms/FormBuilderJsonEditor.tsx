"use client";

import { useCallback } from "react";
import Editor from "react-simple-code-editor";
import { highlight, languages } from "prismjs";
import "prismjs/components/prism-json";
import { cn } from "@/lib/utils";

interface FormBuilderJsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  className?: string;
}

export default function FormBuilderJsonEditor({
  value,
  onChange,
  error,
  className,
}: FormBuilderJsonEditorProps) {
  const highlightJson = useCallback(
    (code: string) => highlight(code, languages.json, "json"),
    []
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "overflow-hidden rounded-xl border bg-slate-950 font-mono text-sm",
          error ? "border-red-400" : "border-slate-700"
        )}
      >
        <Editor
          value={value}
          onValueChange={onChange}
          highlight={highlightJson}
          padding={16}
          tabSize={2}
          insertSpaces
          className="min-h-[420px] outline-none"
          textareaClassName="outline-none"
          preClassName="!m-0"
          style={{
            fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
            fontSize: 13,
            lineHeight: 1.5,
            color: "#e2e8f0",
            minHeight: 420,
          }}
        />
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Edit <code className="text-slate-700">blocks</code> /{" "}
          <code className="text-slate-700">schema_fields</code> and{" "}
          <code className="text-slate-700">logic_rules</code> — changes sync with the visual
          builder when JSON is valid.
        </p>
      )}
    </div>
  );
}
