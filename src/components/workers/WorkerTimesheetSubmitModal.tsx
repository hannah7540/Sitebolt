"use client";

import WorkerTimesheetModal from "./WorkerTimesheetModal";
import type { Worker } from "@/lib/supabase";
import type { WorkerTimesheet } from "@/lib/supabase";

interface WorkerTimesheetSubmitModalProps {
  worker: Worker;
  projectId?: string | null;
  allowedProjectIds?: string[];
  timesheets?: WorkerTimesheet[];
  onClose: () => void;
  onSubmitted: () => void;
}

export default function WorkerTimesheetSubmitModal({
  onSubmitted,
  ...props
}: WorkerTimesheetSubmitModalProps) {
  return <WorkerTimesheetModal {...props} onSubmitted={onSubmitted} />;
}
