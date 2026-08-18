"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ImagePlus,
  Italic,
  Link2,
  List,
  Loader2,
  Underline,
  X,
} from "lucide-react";
import type { EmailSignatureRow } from "@/lib/email-module-types";
import {
  fetchEmailSignatureForEditor,
  saveEmailSignature,
  uploadEmailSignatureImage,
} from "@/lib/email-module-client";
import { htmlToPlainText } from "@/lib/email-signature-utils";
import { inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface EmailSignatureModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (signature: EmailSignatureRow | null, madeLive: boolean) => void;
}

export default function EmailSignatureModal({ open, onClose, onSaved }: EmailSignatureModalProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signatureId, setSignatureId] = useState<string | null>(null);
  const [name, setName] = useState("Email Signature");
  const [makeLive, setMakeLive] = useState(true);
  const [isCurrentlyLive, setIsCurrentlyLive] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  const syncPreview = useCallback(() => {
    setPreviewHtml(editorRef.current?.innerHTML ?? "");
  }, []);

  const loadSignature = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchEmailSignatureForEditor();
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }

    const signature = result.signature;
    setSignatureId(signature?.id ?? null);
    setName(signature?.name ?? "Email Signature");
    setMakeLive(signature?.is_live ?? true);
    setIsCurrentlyLive(signature?.is_live ?? false);

    if (editorRef.current) {
      editorRef.current.innerHTML = signature?.body_html ?? "";
      setPreviewHtml(signature?.body_html ?? "");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadSignature();
  }, [open, loadSignature]);

  const execCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncPreview();
  };

  const insertLink = () => {
    const url = window.prompt("Enter link URL");
    if (!url?.trim()) return;
    execCommand("createLink", url.trim());
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    const result = await uploadEmailSignatureImage(file);
    setUploading(false);

    if (result.error || !result.url) {
      setError(result.error ?? "Failed to upload image.");
      return;
    }

    editorRef.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<img src="${result.url}" alt="Logo" style="max-height:64px;max-width:200px;" />`
    );
    syncPreview();
  };

  const handleSave = async (live: boolean) => {
    const bodyHtml = editorRef.current?.innerHTML.trim() ?? "";
    if (!bodyHtml) {
      setError("Signature body cannot be empty.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await saveEmailSignature({
        id: signatureId,
        name: name.trim() || "Email Signature",
        body_html: bodyHtml,
        body_text: htmlToPlainText(bodyHtml),
        make_live: live,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      onSaved(result.signature, live);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save signature.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Email Signature</h2>
            <p className="text-xs text-slate-500">
              Design your Outlook-style signature for outbound site communications.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : (
            <>
              <div>
                <label className={labelClass}>Signature Name</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={cn(inputClass, "mt-1")}
                  placeholder="Company Signature"
                />
              </div>

              <div>
                <label className={labelClass}>Signature Editor</label>
                <div className="mt-1 overflow-hidden rounded-lg border border-slate-200">
                  <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-2">
                    <ToolbarButton icon={Bold} label="Bold" onClick={() => execCommand("bold")} />
                    <ToolbarButton
                      icon={Italic}
                      label="Italic"
                      onClick={() => execCommand("italic")}
                    />
                    <ToolbarButton
                      icon={Underline}
                      label="Underline"
                      onClick={() => execCommand("underline")}
                    />
                    <ToolbarButton icon={Link2} label="Link" onClick={insertLink} />
                    <select
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                      defaultValue="3"
                      onChange={(event) => execCommand("fontSize", event.target.value)}
                    >
                      <option value="2">Small</option>
                      <option value="3">Normal</option>
                      <option value="4">Large</option>
                      <option value="5">Extra Large</option>
                    </select>
                    <ToolbarButton
                      icon={AlignLeft}
                      label="Align left"
                      onClick={() => execCommand("justifyLeft")}
                    />
                    <ToolbarButton
                      icon={AlignCenter}
                      label="Align center"
                      onClick={() => execCommand("justifyCenter")}
                    />
                    <ToolbarButton
                      icon={AlignRight}
                      label="Align right"
                      onClick={() => execCommand("justifyRight")}
                    />
                    <ToolbarButton
                      icon={List}
                      label="Bullet list"
                      onClick={() => execCommand("insertUnorderedList")}
                    />
                    <ToolbarButton
                      icon={ImagePlus}
                      label="Insert logo"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleImageUpload(file);
                        event.target.value = "";
                      }}
                    />
                  </div>
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={syncPreview}
                    className="min-h-40 px-4 py-3 text-sm text-slate-800 outline-none"
                    data-placeholder="Kind regards,&#10;Your Name&#10;Site Manager | Company Name"
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Live Preview</label>
                <div
                  className="mt-1 min-h-24 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                  dangerouslySetInnerHTML={{
                    __html: previewHtml || "<p class='text-slate-400'>Preview appears here…</p>",
                  }}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Make Live Signature</p>
                  <p className="text-xs text-slate-500">
                    When enabled, this signature is appended to all outbound emails.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMakeLive((current) => !current)}
                  className={cn(
                    "relative inline-flex h-7 w-12 items-center rounded-full transition",
                    makeLive ? "bg-emerald-500" : "bg-slate-300"
                  )}
                  aria-pressed={makeLive}
                >
                  <span
                    className={cn(
                      "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
                      makeLive ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {makeLive || isCurrentlyLive ? (
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {makeLive ? "Will be live after save" : "Currently live"}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void handleSave(false)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Save as Draft
          </button>
          <button
            type="button"
            disabled={saving || loading || !makeLive}
            onClick={() => void handleSave(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save &amp; Make Live
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Bold;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-60"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
