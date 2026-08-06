"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  DEFAULT_ITP_TEMPLATES,
  ITP_TRADE_CATEGORIES,
} from "@/lib/itp-templates";
import { cloneItpFromTemplate, createProjectItp } from "@/lib/itp-service";
import { inputClass, labelClass } from "@/lib/ui-classes";

interface ItpCreateModalProps {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function ItpCreateModal({
  projectId,
  onClose,
  onCreated,
}: ItpCreateModalProps) {
  const [mode, setMode] = useState<"template" | "custom">("template");
  const [templateKey, setTemplateKey] = useState(DEFAULT_ITP_TEMPLATES[0]?.key ?? "");
  const [title, setTitle] = useState("");
  const [tradeCategory, setTradeCategory] = useState<string>(
    DEFAULT_ITP_TEMPLATES[0]?.trade_category ?? "General"
  );
  const [subcontractor, setSubcontractor] = useState("");
  const [location, setLocation] = useState("");
  const [revision, setRevision] = useState("A");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = DEFAULT_ITP_TEMPLATES.find((t) => t.key === templateKey);

  const handleTemplateChange = (key: string) => {
    setTemplateKey(key);
    const template = DEFAULT_ITP_TEMPLATES.find((t) => t.key === key);
    if (template) {
      setTitle(template.title);
      setTradeCategory(template.trade_category);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setSaving(true);
    setError(null);

    let result;
    if (mode === "template" && selectedTemplate) {
      result = await cloneItpFromTemplate(projectId, selectedTemplate, {
        title,
        trade_category: tradeCategory,
        subcontractor_name: subcontractor || undefined,
        location_area: location || undefined,
        revision,
      });
    } else {
      result = await createProjectItp({
        project_id: projectId,
        title,
        trade_category: tradeCategory,
        subcontractor_name: subcontractor || undefined,
        location_area: location || undefined,
        revision,
      });
    }

    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded p-1 text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-bold text-slate-900">Create New ITP / ITC</h2>
        <p className="mt-1 text-sm text-slate-500">
          Load from a standard template or start a custom checklist.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode("template")}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              mode === "template"
                ? "bg-orange-500 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            From Template
          </button>
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              mode === "custom"
                ? "bg-orange-500 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            Custom Checklist
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
          {mode === "template" ? (
            <div>
              <label className={labelClass}>Template Library</label>
              <select
                value={templateKey}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className={inputClass}
              >
                {DEFAULT_ITP_TEMPLATES.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.title} ({template.trade_category})
                  </option>
                ))}
              </select>
              {selectedTemplate ? (
                <p className="mt-1 text-xs text-slate-500">{selectedTemplate.description}</p>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className={labelClass}>Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Trade Category</label>
              <select
                value={tradeCategory}
                onChange={(e) => setTradeCategory(e.target.value)}
                className={inputClass}
              >
                {ITP_TRADE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Revision</label>
              <input
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Subcontractor</label>
            <input
              value={subcontractor}
              onChange={(e) => setSubcontractor(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Location / Area</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputClass}
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create ITP
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
