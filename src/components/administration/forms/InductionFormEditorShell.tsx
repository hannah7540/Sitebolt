"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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

export default function InductionFormEditorShell({
  formId = null,
}: InductionFormEditorShellProps) {
  const router = useRouter();
  const { projects, sessionReady, loading, accessDenied } = useAdminConsole();
  const [templates, setTemplates] = useState<InductionFormTemplate[]>([]);
  const [initialForm, setInitialForm] = useState<InductionFormTemplate | null>(null);
  const [editorLoading, setEditorLoading] = useState(Boolean(formId));
  const { toast, showSuccess, showError, dismissToast } = useFormToast();

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

  const loadForm = useCallback(async () => {
    if (!formId) {
      setInitialForm(null);
      setEditorLoading(false);
      return;
    }

    setEditorLoading(true);
    try {
      const { form, error } = await fetchInductionFormById(formId);
      if (error) {
        showError(error);
        router.replace("/admin/forms/inductions");
        return;
      }
      if (!form) {
        showError("Induction form not found.");
        router.replace("/admin/forms/inductions");
        return;
      }
      setInitialForm(form);
    } catch (error) {
      showError(
        error instanceof Error ? error.message : "Failed to load induction form."
      );
      router.replace("/admin/forms/inductions");
    } finally {
      setEditorLoading(false);
    }
  }, [formId, router, showError]);

  useEffect(() => {
    if (!sessionReady || loading) return;
    void loadTemplates();
    void loadForm();
  }, [sessionReady, loading, loadTemplates, loadForm]);

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
        Loading form builder…
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
