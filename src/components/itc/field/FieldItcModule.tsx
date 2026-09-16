"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2 } from "lucide-react";
import FieldItcRegister from "@/components/itc/field/FieldItcRegister";
import FieldItcDetail from "@/components/itc/field/FieldItcDetail";
import FieldItcPhotoGallery from "@/components/itc/field/FieldItcPhotoGallery";
import FieldItcPressureTest from "@/components/itc/field/FieldItcPressureTest";
import FieldItcMaterialsAdmin from "@/components/itc/field/FieldItcMaterialsAdmin";
import FieldItcCertificate from "@/components/itc/field/FieldItcCertificate";
import FieldItcPlanView from "@/components/itc/field/FieldItcPlanView";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import {
  getItc,
  listItcs,
  listPhotos,
  listProgressLog,
  listRoverOptions,
  listSignoffs,
  type FieldItcFilters,
  type FieldItcListResult,
  type FieldItcPhoto,
  type FieldItcRecord,
  type FieldItcSignoff,
  type FieldProgressLog,
} from "@/lib/api/itc";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { getAdminItcPath } from "@/lib/console-nav-routes";

type FieldItcTab =
  | "register"
  | "plan"
  | "detail"
  | "photos"
  | "pressure"
  | "materials"
  | "certificate";

const TABS: Array<{ id: FieldItcTab; label: string }> = [
  { id: "register", label: "Register" },
  { id: "plan", label: "Plan" },
  { id: "detail", label: "ITC Detail" },
  { id: "photos", label: "Photo QA" },
  { id: "pressure", label: "Pressure Test" },
  { id: "materials", label: "Materials" },
  { id: "certificate", label: "Certificate" },
];

interface FieldItcModuleProps {
  initialItcId?: string | null;
}

export default function FieldItcModule({ initialItcId = null }: FieldItcModuleProps) {
  const router = useRouter();
  const { projects, adminWorkerId, workers, loading: sessionLoading } = useAdminConsole();
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");
  const [tab, setTab] = useState<FieldItcTab>(initialItcId ? "detail" : "register");
  const [filters, setFilters] = useState<FieldItcFilters>({
    status: "all",
    zone: "all",
    building: "all",
    service: "all",
    search: "",
  });
  const [list, setList] = useState<FieldItcListResult>({
    itcs: [],
    zones: [],
    services: [],
    buildings: [],
  });
  const [selected, setSelected] = useState<FieldItcRecord | null>(null);
  const [signoffs, setSignoffs] = useState<FieldItcSignoff[]>([]);
  const [photos, setPhotos] = useState<FieldItcPhoto[]>([]);
  const [progress, setProgress] = useState<FieldProgressLog[]>([]);
  const [rovers, setRovers] = useState<string[]>(["Rover-01", "Rover-02"]);
  const [operators, setOperators] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!projectId && projects[0]?.id) {
      setProjectId(projects[0].id);
    }
  }, [projectId, projects]);

  const workerName = useMemo(() => {
    if (!adminWorkerId) return "Signed-in user";
    const worker = workers.find((row) => row.id === adminWorkerId);
    return worker ? getWorkerDisplayName(worker) : "Signed-in user";
  }, [adminWorkerId, workers]);

  const projectName = useMemo(
    () => projects.find((row) => row.id === projectId)?.name ?? "Project",
    [projects, projectId]
  );

  const loadList = useCallback(async () => {
    if (!projectId) {
      setList({ itcs: [], zones: [], services: [], buildings: [] });
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    const result = await listItcs({ ...filters, projectId });
    setList(result);
    setLoadingList(false);
  }, [filters, projectId]);

  const loadDetail = useCallback(
    async (itcId: string) => {
      setLoadingDetail(true);
      const [itc, nextSignoffs, nextPhotos, nextProgress, roverOptions] = await Promise.all([
        getItc(itcId),
        listSignoffs(itcId),
        listPhotos(itcId),
        listProgressLog(itcId),
        projectId
          ? listRoverOptions(projectId)
          : Promise.resolve({ rovers: ["Rover-01"], operators: [] as string[] }),
      ]);
      if (itc) {
        setSelected(itc);
        if (itc.project_id && itc.project_id !== projectId) {
          setProjectId(itc.project_id);
        }
      }
      setSignoffs(nextSignoffs);
      setPhotos(nextPhotos);
      setProgress(nextProgress);
      setRovers(roverOptions.rovers);
      setOperators(roverOptions.operators);
      setLoadingDetail(false);
    },
    [projectId]
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!initialItcId) return;
    void loadDetail(initialItcId);
    setTab("detail");
  }, [initialItcId, loadDetail]);

  const handleSelect = (itc: FieldItcRecord) => {
    setSelected(itc);
    setTab("detail");
    router.replace(getAdminItcPath(itc.id));
    void loadDetail(itc.id);
  };

  const requireSelected = tab !== "register" && tab !== "materials" && tab !== "plan";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-orange-500">
            <ClipboardCheck className="h-4 w-4" />
            ITP / ITC
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">Inspection Test Certificates</h1>
          <p className="text-sm text-slate-500">
            Field register, 17-step sign-off, photo QA, pressure test, and certificate preview.
          </p>
        </div>
        <label className="min-w-[220px]">
          <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
            Project
          </span>
          <select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value);
              setSelected(null);
              setTab("register");
              router.replace(getAdminItcPath());
            }}
            className={inputClass}
          >
            {projects.length === 0 ? <option value="">No projects</option> : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-semibold",
              tab === item.id
                ? "bg-orange-500 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {sessionLoading || loadingList ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          Loading ITC register…
        </div>
      ) : tab === "register" ? (
        <FieldItcRegister
          data={list}
          filters={filters}
          selectedId={selected?.id ?? initialItcId ?? null}
          onFiltersChange={setFilters}
          onSelect={handleSelect}
        />
      ) : tab === "materials" ? (
        <FieldItcMaterialsAdmin />
      ) : tab === "plan" ? (
        <FieldItcPlanView
          projectId={projectId}
          data={list}
          selectedId={selected?.id ?? initialItcId ?? null}
          onSelect={handleSelect}
          onCreated={(itc) => {
            void loadList();
            setSelected(itc);
          }}
        />
      ) : requireSelected && !selected ? (
        <div className={`${cardClass} p-6 text-sm text-slate-600`}>
          Select an ITC from the Register tab to open this view.
        </div>
      ) : selected && adminWorkerId ? (
        loadingDetail && tab === "detail" ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            Loading ITC…
          </div>
        ) : tab === "detail" ? (
          <FieldItcDetail
            projectId={projectId}
            itc={selected}
            signoffs={signoffs}
            progress={progress}
            workerId={adminWorkerId}
            workerName={workerName}
            roverOptions={rovers}
            operatorOptions={operators}
            onSigned={() => void loadDetail(selected.id)}
          />
        ) : tab === "photos" ? (
          <FieldItcPhotoGallery
            projectId={projectId}
            itc={selected}
            photos={photos}
            uploadedBy={adminWorkerId}
            onChanged={() => void loadDetail(selected.id)}
          />
        ) : tab === "pressure" ? (
          <FieldItcPressureTest
            itc={selected}
            projectId={projectId}
            workerId={adminWorkerId}
            workerName={workerName}
          />
        ) : (
          <FieldItcCertificate
            itc={selected}
            projectName={projectName}
            photos={photos}
            signoffs={signoffs}
          />
        )
      ) : (
        <div className={`${cardClass} p-6 text-sm text-amber-800`}>
          Your account is signed in but is not linked to a worker profile.
        </div>
      )}
    </div>
  );
}
