"use client";

import { useState } from "react";
import { ClipboardList, FileSpreadsheet, MapPin, Wrench } from "lucide-react";
import ItcCompactionMapView from "@/components/itc/ItcCompactionMapView";
import ItcMasterSpecPanel from "@/components/itc/ItcMasterSpecPanel";
import ItcQualitySystemView from "@/components/itc/ItcQualitySystemView";
import ItcTradeFormPanel from "@/components/itc/ItcTradeFormPanel";
import { cn } from "@/lib/utils";

type HubTab = "master-spec" | "trade-forms" | "register" | "compaction";

interface ItcManagementHubProps {
  projectId: string;
  projectName: string;
  workerId: string;
  workerName: string;
}

const TABS: Array<{ id: HubTab; label: string; icon: typeof Wrench }> = [
  { id: "master-spec", label: "Master Spec Workbook", icon: FileSpreadsheet },
  { id: "trade-forms", label: "Add ITC", icon: Wrench },
  { id: "register", label: "On-Site Register", icon: ClipboardList },
  { id: "compaction", label: "Compaction Map", icon: MapPin },
];

export default function ItcManagementHub({
  projectId,
  projectName,
  workerId,
  workerName,
}: ItcManagementHubProps) {
  const [activeTab, setActiveTab] = useState<HubTab>("master-spec");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          ITC &amp; <span className="text-orange-500">Compaction</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Master specification workbook, add ITC records, worker execution, and GPS
          compaction mapping for {projectName}.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold",
                activeTab === tab.id
                  ? "bg-orange-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "master-spec" ? <ItcMasterSpecPanel projectId={projectId} /> : null}
      {activeTab === "trade-forms" ? <ItcTradeFormPanel projectId={projectId} /> : null}
      {activeTab === "register" ? (
        <ItcQualitySystemView
          projectId={projectId}
          projectName={projectName}
          workerId={workerId}
          workerName={workerName}
          defaultPanel="register"
        />
      ) : null}
      {activeTab === "compaction" ? <ItcCompactionMapView projectId={projectId} /> : null}
    </div>
  );
}
