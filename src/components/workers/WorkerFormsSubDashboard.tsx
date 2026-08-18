"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  MessageSquare,
  ShieldCheck,
  Sun,
} from "lucide-react";
import WorkerMobileBackButton from "@/components/layout/WorkerMobileBackButton";
import { useMobileBackHandler } from "@/hooks/useMobileBackHandler";
import type { DbProject } from "@/lib/project-resolver";
import type { LeaveRequest, Worker } from "@/lib/supabase";
import type { SiteFormType } from "@/lib/site-forms";
import { fetchWorkerRfis } from "@/lib/rfi-service";
import WorkerLeaveRequestsWidget from "@/components/workers/WorkerLeaveRequestsWidget";
import WorkerRFITile from "@/components/workers/WorkerRFITile";
import WorkerRFIPanel from "@/components/workers/WorkerRFIPanel";
import WorkerSubmitRFIModal from "@/components/workers/SubmitRFIModal";
import WorkerRequestModal from "@/components/workers/WorkerRequestModal";
import WorkerRequestTile from "@/components/workers/WorkerRequestTile";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

export interface FormsHubTile {
  id: string;
  title: string;
  description: string;
  emoji: string;
  icon: React.ReactNode;
  accent: string;
  formType: SiteFormType;
}

export const FORMS_HUB_TILES: FormsHubTile[] = [
  {
    id: "toolbox",
    title: "Toolbox Talks",
    description: "Record toolbox meeting & sign-on",
    emoji: "🛠️",
    icon: <MessageSquare className="h-6 w-6" />,
    accent: "border-orange-200 bg-orange-50 text-orange-600",
    formType: "toolbox_talk",
  },
  {
    id: "prestart",
    title: "Daily Pre-Start Meeting",
    description: "Sign on for today's shift",
    emoji: "🌅",
    icon: <Sun className="h-6 w-6" />,
    accent: "border-amber-200 bg-amber-50 text-amber-600",
    formType: "daily_prestart",
  },
  {
    id: "safety_walk",
    title: "Safety Walk",
    description: "Document site safety inspection",
    emoji: "🦺",
    icon: <ShieldCheck className="h-6 w-6" />,
    accent: "border-emerald-200 bg-emerald-50 text-emerald-600",
    formType: "safety_walk",
  },
];

type FormsHubModal = "rfi" | "request" | null;

interface WorkerFormsSubDashboardProps {
  worker: Worker;
  projects: DbProject[];
  defaultProjectId?: string | null;
  leaveRequests: LeaveRequest[];
  onBack: () => void;
  onOpenSiteForm: (formType: SiteFormType) => void;
  onSubmitLeave: () => void;
}

export default function WorkerFormsSubDashboard({
  worker,
  projects,
  defaultProjectId,
  leaveRequests,
  onBack,
  onOpenSiteForm,
  onSubmitLeave,
}: WorkerFormsSubDashboardProps) {
  const [selectedForm, setSelectedForm] = useState<FormsHubModal>(null);
  const [assignedRfiCount, setAssignedRfiCount] = useState(0);
  const [rfiRefreshKey, setRfiRefreshKey] = useState(0);

  const openRfiForm = () => {
    try {
      console.info("[WorkerFormsSubDashboard] Opening RFI modal");
      setSelectedForm("rfi");
    } catch (error) {
      console.error("[WorkerFormsSubDashboard] Failed to open RFI modal:", error);
    }
  };

  const openRequestForm = () => {
    try {
      console.info("[WorkerFormsSubDashboard] Opening Request Form modal");
      setSelectedForm("request");
    } catch (error) {
      console.error("[WorkerFormsSubDashboard] Failed to open Request Form modal:", error);
    }
  };

  const closeActiveForm = () => {
    setSelectedForm(null);
  };

  const loadAssignedCount = useCallback(async () => {
    const result = await fetchWorkerRfis(worker.id);
    setAssignedRfiCount(result.assigned.length);
  }, [worker.id]);

  useEffect(() => {
    void loadAssignedCount();
  }, [loadAssignedCount, rfiRefreshKey]);

  const handleRfiSubmitted = () => {
    setRfiRefreshKey((key) => key + 1);
  };

  const handleMobileBack = useCallback(() => {
    if (selectedForm) {
      closeActiveForm();
      return true;
    }
    onBack();
    return true;
  }, [onBack, selectedForm]);

  useMobileBackHandler(handleMobileBack, true);

  return (
    <div className="space-y-4 worker-mobile-content-pad lg:pb-0">
      <button
        type="button"
        onClick={onBack}
        className="hidden items-center gap-2 text-sm font-semibold text-slate-600 hover:text-orange-600 lg:inline-flex"
      >
        ← Back to Main Dashboard
      </button>

      <WorkerMobileBackButton label="Back to Main Dashboard" onClick={onBack} />

      <div>
        <h2 className="text-lg font-bold text-slate-900">Forms & Safety Submissions</h2>
        <p className="mt-1 text-sm text-slate-500">
          Complete site safety forms below. Manage leave requests in the section underneath.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FORMS_HUB_TILES.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() => onOpenSiteForm(tile.formType)}
            className={cn(
              cardClass,
              "flex h-full flex-col items-start gap-3 p-4 text-left transition hover:border-orange-300 hover:shadow-md active:scale-[0.99]"
            )}
          >
            <span className="text-xl" aria-hidden>
              {tile.emoji}
            </span>
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-xl border",
                tile.accent
              )}
            >
              {tile.icon}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">{tile.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{tile.description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        ))}
        <WorkerRFITile assignedCount={assignedRfiCount} onClick={openRfiForm} />
        <WorkerRequestTile onClick={openRequestForm} />
      </div>

      <WorkerRFIPanel
        key={rfiRefreshKey}
        workerId={worker.id}
        onRefresh={() => setRfiRefreshKey((key) => key + 1)}
      />

      {selectedForm === "rfi" ? (
        <WorkerSubmitRFIModal
          worker={worker}
          seedProjects={projects}
          defaultProjectId={defaultProjectId}
          onClose={closeActiveForm}
          onSubmitted={handleRfiSubmitted}
        />
      ) : null}

      {selectedForm === "request" ? (
        <WorkerRequestModal
          worker={worker}
          seedProjects={projects}
          defaultProjectId={defaultProjectId}
          onClose={closeActiveForm}
          onSubmitted={closeActiveForm}
        />
      ) : null}

      <WorkerLeaveRequestsWidget
        leaveRequests={leaveRequests}
        onSubmitLeave={onSubmitLeave}
      />
    </div>
  );
}

export function FormsHubPreviewBadges() {
  return (
    <p className="text-xs leading-relaxed text-slate-500">
      Toolbox Talks • Pre-Starts • Safety Walks • RFI • Request Form • Leave Requests
    </p>
  );
}
