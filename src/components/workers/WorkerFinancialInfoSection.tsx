"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Pencil } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import { sectionClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import WorkerFinancialEditModal from "./WorkerFinancialEditModal";

interface WorkerFinancialInfoSectionProps {
  workerId: string;
  worker: Worker;
  onSaved: (worker: Worker) => void;
  compact?: boolean;
}

export default function WorkerFinancialInfoSection({
  workerId,
  worker,
  onSaved,
  compact = false,
}: WorkerFinancialInfoSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={compact ? undefined : sectionClass}>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-800 hover:bg-orange-100",
          compact && "min-h-11"
        )}
      >
        <Pencil className="h-4 w-4" />
        View & Edit Financial Details
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <WorkerFinancialEditModal
              workerId={workerId}
              worker={worker}
              onClose={() => setOpen(false)}
              onSaved={(updated) => {
                onSaved(updated);
                setOpen(false);
              }}
            />,
            document.body
          )
        : null}
    </div>
  );
}
