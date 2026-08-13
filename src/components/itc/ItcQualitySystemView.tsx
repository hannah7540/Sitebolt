"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Plus, Users } from "lucide-react";
import ItcBatchGeneratorPanel from "@/components/itc/ItcBatchGeneratorPanel";
import ItcBulkCreateModal from "@/components/itc/ItcBulkCreateModal";
import ItcBulkSignOffModal from "@/components/itc/ItcBulkSignOffModal";
import ItcDetailView from "@/components/itc/ItcDetailView";
import ItcPlanMapView from "@/components/itc/ItcPlanMapView";
import ItcRegisterList from "@/components/itc/ItcRegisterList";
import ItcVerificationQueue from "@/components/itc/ItcVerificationQueue";
import ItcZoneFilterPills from "@/components/itc/ItcZoneFilterPills";
import {
  fetchItcDetail,
  fetchItcZones,
  fetchProjectItcs,
  type ItcDetailBundle,
  type ItcZone,
  type ProjectItc,
} from "@/lib/itc-service";

interface ItcQualitySystemViewProps {
  projectId: string;
  projectName: string;
  workerId: string;
  workerName: string;
  defaultPanel?: "register" | "batch" | "queue";
}

export default function ItcQualitySystemView({
  projectId,
  projectName,
  workerId,
  workerName,
  defaultPanel = "batch",
}: ItcQualitySystemViewProps) {
  const [zones, setZones] = useState<ItcZone[]>([]);
  const [itcs, setItcs] = useState<ProjectItc[]>([]);
  const [selectedZone, setSelectedZone] = useState("ALL");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [focusedItcId, setFocusedItcId] = useState<string | null>(null);
  const [activeItcId, setActiveItcId] = useState<string | null>(null);
  const [detailBundle, setDetailBundle] = useState<ItcDetailBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [showBulkSignOff, setShowBulkSignOff] = useState(false);
  const [activePanel, setActivePanel] = useState<"register" | "batch" | "queue">(defaultPanel);

  const load = useCallback(async () => {
    setLoading(true);
    const [zoneRows, itcRows] = await Promise.all([
      fetchItcZones(projectId),
      fetchProjectItcs(projectId, selectedZone),
    ]);
    setZones(zoneRows);
    setItcs(itcRows);
    setLoading(false);
  }, [projectId, selectedZone]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!activeItcId) {
      setDetailBundle(null);
      return;
    }

    void fetchItcDetail(activeItcId).then((bundle) => setDetailBundle(bundle));
  }, [activeItcId]);

  const filteredItcs = useMemo(() => {
    if (selectedZone === "ALL") return itcs;
    return itcs.filter((itc) => itc.zone_code === selectedZone);
  }, [itcs, selectedZone]);

  const toggleSelect = (itcId: string) => {
    setSelectedIds((current) =>
      current.includes(itcId) ? current.filter((id) => id !== itcId) : [...current, itcId]
    );
  };

  const handleZoneSelect = (zoneCode: string) => {
    setSelectedZone(zoneCode);
    setFocusedItcId(null);
  };

  const handleMapSelect = (itcId: string, zoneCode: string | null) => {
    if (zoneCode) setSelectedZone(zoneCode);
    setFocusedItcId(itcId);
    setActivePanel("register");
  };

  if (loading && !detailBundle) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
        Loading ITC quality system…
      </div>
    );
  }

  if (activeItcId && detailBundle) {
    return (
      <ItcDetailView
        projectId={projectId}
        projectName={projectName}
        bundle={detailBundle}
        workerId={workerId}
        workerName={workerName}
        isAdmin
        onBack={() => setActiveItcId(null)}
        onUpdated={() => {
          void load();
          void fetchItcDetail(activeItcId).then((bundle) => setDetailBundle(bundle));
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            ITPs & <span className="text-orange-500">ITCs</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Drawing pin dropper, batch ITC table editor, register, sign-offs, and PDF export for{" "}
            {projectName}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowBulkCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
          >
            <Plus className="h-4 w-4" />
            Bulk Create
          </button>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => setShowBulkSignOff(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Bulk Sign-Off ({selectedIds.length})
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setActivePanel("register")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            activePanel === "register"
              ? "bg-orange-600 text-white"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          ITC Register
        </button>
        <button
          type="button"
          onClick={() => setActivePanel("batch")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
            activePanel === "batch"
              ? "bg-orange-600 text-white"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          <MapPin className="h-4 w-4" />
          Pin Dropper & Batch Generator
        </button>
        <button
          type="button"
          onClick={() => setActivePanel("queue")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
            activePanel === "queue"
              ? "bg-orange-600 text-white"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          <Users className="h-4 w-4" />
          Leading Hand / Admin Queue
        </button>
      </div>

      {activePanel === "register" ? (
        <>
          <ItcZoneFilterPills zones={zones} selectedZone={selectedZone} onSelect={handleZoneSelect} />
          <ItcPlanMapView
            itcs={itcs}
            selectedZone={selectedZone}
            focusedItcId={focusedItcId}
            onSelectItc={handleMapSelect}
          />
        </>
      ) : null}

      {activePanel === "batch" ? (
        <ItcBatchGeneratorPanel
          projectId={projectId}
          projectName={projectName}
          uploadedBy={workerName}
          onGenerated={() => void load()}
        />
      ) : activePanel === "register" ? (
        <ItcRegisterList
          itcs={filteredItcs}
          selectedIds={selectedIds}
          focusedItcId={focusedItcId}
          onToggleSelect={toggleSelect}
          onOpenItc={setActiveItcId}
        />
      ) : (
        <ItcVerificationQueue
          projectId={projectId}
          reviewerId={workerId}
          reviewerName={workerName}
          onUpdated={() => void load()}
        />
      )}

      {showBulkCreate ? (
        <ItcBulkCreateModal
          projectId={projectId}
          zones={zones}
          onClose={() => setShowBulkCreate(false)}
          onCreated={() => void load()}
        />
      ) : null}

      {showBulkSignOff ? (
        <ItcBulkSignOffModal
          projectId={projectId}
          itcIds={selectedIds}
          authorId={workerId}
          authorName={workerName}
          onClose={() => setShowBulkSignOff(false)}
          onSigned={() => {
            setSelectedIds([]);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
