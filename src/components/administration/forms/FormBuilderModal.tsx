"use client";

import { useEffect } from "react";
import FormBuilder from "@/components/administration/forms/FormBuilder";
import type { DbProject } from "@/lib/project-resolver";
import type { InductionFormTemplate } from "@/lib/induction-form-builder";
import { modalOverlayClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface FormBuilderModalProps {
  projects: DbProject[];
  templates: InductionFormTemplate[];
  initialForm?: InductionFormTemplate | null;
  onClose: () => void;
  onSaved: (form: InductionFormTemplate) => void;
}

export default function FormBuilderModal({
  projects,
  templates,
  initialForm,
  onClose,
  onSaved,
}: FormBuilderModalProps) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleClose = (event?: React.MouseEvent) => {
    event?.preventDefault();
    onClose();
  };

  return (
    <div className={modalOverlayClass} onClick={handleClose}>
      <div
        className={cn("relative max-h-[92vh] w-full max-w-4xl")}
        onClick={(event) => event.stopPropagation()}
      >
        <FormBuilder
          variant="embedded"
          projects={projects}
          templates={templates}
          initialForm={initialForm}
          onClose={onClose}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}
