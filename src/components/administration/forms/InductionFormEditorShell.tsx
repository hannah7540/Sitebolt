"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import FormBuilder from "@/components/administration/forms/FormBuilder";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import {
  fetchInductionFormById,
  fetchInductionForms,
  type InductionFormTemplate,
} from "@/lib/induction-form-builder";

interface InductionFormEditorShellProps {
  formId?: string | null;
}

const LOAD_ERROR_FALLBACK = "Failed to load induction data";

export default function InductionFormEditorShell({
  formId = null,
}: InductionFormEditorShellProps) {
  const router = useRouter();
  const { projects, sessionReady, loading, accessDenied } = useAdminConsole();
  const [templates, setTemplates] = useState<InductionFormTemplate[]>([]);
  const [initialForm, setInitialForm] = useState<InductionFormTemplate | null>(null);
  const [editorLoading, setEditorLoading] = useState(Boolean(formId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast, showSuccess, showError, dismissToast } = useFormToast();
  const isEdit = Boolean(formId?.trim());

  const loadTemplates = useCallback(async () => {
    try {
      const { forms: rows, error } = await fetchInductionForms();
      setTemplates(rows);
      if (error) showError(error);
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to load induction forms."
      );
      setTemplates([]);
    }
  }, [showError]);

  const applyLoadedForm = useCallback(
    (form: InductionFormTemplate | null, error: string | null) => {
      if (error && !form) {
        const message = error.trim() || LOAD_ERROR_FALLBACK;
        setLoadError(message);
        showError(message);
        setInitialForm(null);
        return;
      }
      if (!form) {
        setLoadError(LOAD_ERROR_FALLBACK);
        showError(LOAD_ERROR_FALLBACK);
        setInitialForm(null);
        return;
      }
      if (error) showError(error);
      setLoadError(null);
      setInitialForm(form);
    },
    [showError]
  );

  const loadForm = useCallback(async () => {
    const id = formId?.trim() ?? "";
    if (!id) {
      setInitialForm(null);
      setLoadError(null);
      setEditorLoading(false);
      return;
    }

    setEditorLoading(true);
    setLoadError(null);
    try {
      const { form, error } = await fetchInductionFormById(id);
      applyLoadedForm(form, error);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : LOAD_ERROR_FALLBACK;
      setLoadError(message);
      showError(message);
      setInitialForm(null);
    } finally {
      setEditorLoading(false);
    }
  }, [applyLoadedForm, formId, showError]);

  useEffect(() => {
    if (!sessionReady || loading) return;
    let cancelled = false;

    void loadTemplates();

    const id = formId?.trim() ?? "";
    if (!id) {
      setInitialForm(null);
      setLoadError(null);
      setEditorLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setEditorLoading(true);
    setLoadError(null);

    void fetchInductionFormById(id)
      .then(({ form, error }) => {
        if (cancelled) return;
        applyLoadedForm(form, error);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : LOAD_ERROR_FALLBACK;
        setLoadError(message);
        showError(message);
        setInitialForm(null);
      })
      .finally(() => {
        if (!cancelled) setEditorLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applyLoadedForm, formId, loadTemplates, loading, sessionReady, showError]);

  const handleSaved = (form: InductionFormTemplate) => {
    setInitialForm(form);
    showSuccess(`"${form.title}" saved. Continue editing or use Save & Exit when finished.`);

    if (!formId && form.id) {
      router.replace(`/admin/forms/inductions/${form.id}/edit`);
    }
  };

  const handleClose = () => {
    router.push("/admin/forms/inductions");
  };

  if (loading || !sessionReady || editorLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        {isEdit ? "Loading induction…" : "Loading form builder…"}
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {accessDenied}
      </div>
    );
  }

  if (isEdit && (loadError || !initialForm)) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError || LOAD_ERROR_FALLBACK}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadForm()}
            className="inline-flex items-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to inductions
          </button>
        </div>
        {toast ? (
          <Toast
            message={toast.message}
            variant={toast.variant}
            onDismiss={dismissToast}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full max-w-none flex-1 min-w-0 px-4 sm:px-6 lg:px-8">
      <FormBuilder
        variant="page"
        projects={projects}
        templates={templates}
        initialForm={initialForm}
        onClose={handleClose}
        onSaved={handleSaved}
      />

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={dismissToast}
        />
      ) : null}
    </div>
  );
}
