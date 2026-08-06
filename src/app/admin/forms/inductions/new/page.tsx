"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import FormBuilder from "@/components/administration/forms/FormBuilder";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import {
  fetchInductionForms,
  type InductionFormTemplate,
} from "@/lib/induction-form-builder";

function NewInductionFormContent() {
  const router = useRouter();
  const { projects, sessionReady, loading, accessDenied } = useAdminConsole();
  const [templates, setTemplates] = useState<InductionFormTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const { toast, showError, dismissToast } = useFormToast();

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const { forms: rows, error } = await fetchInductionForms();
      setTemplates(rows);
      if (error) {
        showError(error);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load induction forms.";
      showError(message);
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (!sessionReady || loading) return;
    void loadTemplates();
  }, [sessionReady, loading, loadTemplates]);

  if (loading || !sessionReady || templatesLoading) {
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
        onClose={() => router.push("/admin/forms/inductions")}
        onSaved={() => router.push("/admin/forms/inductions")}
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

export default function NewInductionFormPage() {
  return (
    <AdminConsoleShell>
      <NewInductionFormContent />
    </AdminConsoleShell>
  );
}
