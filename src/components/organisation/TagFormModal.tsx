"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { WorkerTag } from "@/lib/worker-tags";
import { cn } from "@/lib/utils";
import {
  inputClass,
  labelClass,
  modalClass,
  modalOverlayClass,
} from "@/lib/ui-classes";

interface TagFormModalProps {
  tag?: WorkerTag | null;
  onClose: () => void;
  onSave: (name: string) => Promise<{ error: string | null }>;
}

export default function TagFormModal({ tag, onClose, onSave }: TagFormModalProps) {
  const isEditing = Boolean(tag?.id);
  const [name, setName] = useState(tag?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(tag?.name ?? "");
    setError(null);
  }, [tag]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { error: saveError } = await onSave(trimmed);
      if (saveError) {
        setError(saveError);
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={modalOverlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tag-form-title"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className={cn(modalClass, "max-w-md")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="tag-form-title" className="text-lg font-bold text-slate-900">
            {isEditing ? "Edit Tag" : "Add New Tag"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className={labelClass} htmlFor="tag-title">
          Title *
        </label>
        <input
          id="tag-title"
          className={cn(inputClass, "mt-1")}
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="e.g. NSW Worker"
          disabled={saving}
        />

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEditing ? "Save" : "Create Tag"}
          </button>
        </div>
      </div>
    </div>
  );
}
