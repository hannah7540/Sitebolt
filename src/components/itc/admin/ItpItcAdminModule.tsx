"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import ItcChecklistDrawer from "@/components/itc/admin/ItcChecklistDrawer";
import ItpItcBrowseView, {
  type BrowseKindFilter,
} from "@/components/itc/admin/ItpItcBrowseView";
import ItpItcCreateWizard from "@/components/itc/admin/ItpItcCreateWizard";
import ItpMasterDrawer from "@/components/itc/admin/ItpMasterDrawer";
import {
  deleteAdminItc,
  deleteAdminItp,
  getAdminItc,
  getAdminItp,
  listAdminItcs,
  listAdminItps,
  listItcsForItp,
  toAdminBrowseItems,
  type AdminBrowseItem,
  type AdminItcRecord,
  type AdminItpRecord,
} from "@/components/itc/admin/itp-itc-admin-api";
import ConfirmDeletionDialog from "@/components/ui/ConfirmDeletionDialog";
import Toast from "@/components/ui/Toast";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import { getWorkerDisplayName } from "@/lib/worker-utils";

type AdminItcTab = "view" | "create";

interface ItpItcAdminModuleProps {
  initialRecordId?: string | null;
}

export default function ItpItcAdminModule({ initialRecordId = null }: ItpItcAdminModuleProps) {
  const { projects, adminWorkerId, workers, loading: sessionLoading } = useAdminConsole();
  const [tab, setTab] = useState<AdminItcTab>("view");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [kind, setKind] = useState<BrowseKindFilter>("both");
  const [itps, setItps] = useState<AdminItpRecord[]>([]);
  const [itcs, setItcs] = useState<AdminItcRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [openItp, setOpenItp] = useState<AdminItpRecord | null>(null);
  const [openItc, setOpenItc] = useState<AdminItcRecord | null>(null);
  const [itpPins, setItpPins] = useState<AdminItcRecord[]>([]);
  const [loadingPins, setLoadingPins] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "itp"; itp: AdminItpRecord }
    | { kind: "itc"; itc: AdminItcRecord }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const signerName = useMemo(() => {
    if (!adminWorkerId) return "Signed-in user";
    const worker = workers.find((row) => row.id === adminWorkerId);
    return worker ? getWorkerDisplayName(worker) : "Signed-in user";
  }, [adminWorkerId, workers]);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const [nextItps, nextItcs] = await Promise.all([listAdminItps(), listAdminItcs()]);
    setItps(nextItps);
    setItcs(nextItcs);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    if (!initialRecordId) return;
    void (async () => {
      const [itc, itp] = await Promise.all([
        getAdminItc(initialRecordId),
        getAdminItp(initialRecordId),
      ]);
      if (itc) setOpenItc(itc);
      else if (itp) {
        setOpenItp(itp);
        setLoadingPins(true);
        setItpPins(await listItcsForItp(itp.id));
        setLoadingPins(false);
      }
    })();
  }, [initialRecordId]);

  const browseItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return toAdminBrowseItems(itps, itcs, projects).filter((item) => {
      if (projectFilter && item.project_id !== projectFilter) return false;
      if (kind === "itps" && item.kind !== "itp") return false;
      if (kind === "itcs" && item.kind !== "itc") return false;
      if (!needle) return true;
      return [item.title, item.number, item.line_number, item.area, item.contractor]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [itps, itcs, projects, projectFilter, kind, search]);

  const openItpDrawer = async (id: string) => {
    const itp = itps.find((row) => row.id === id) ?? (await getAdminItp(id));
    if (!itp) return;
    setOpenItc(null);
    setOpenItp(itp);
    setLoadingPins(true);
    setItpPins(await listItcsForItp(itp.id));
    setLoadingPins(false);
  };

  const openItcDrawer = async (id: string) => {
    const itc =
      itcs.find((row) => row.id === id) ??
      itpPins.find((row) => row.id === id) ??
      (await getAdminItc(id));
    if (!itc) return;
    setOpenItc(itc);
  };

  const projectName = (projectId: string) =>
    projects.find((row) => row.id === projectId)?.name ?? "Project";

  const requestDeleteFromBrowse = (item: AdminBrowseItem) => {
    if (item.kind === "itp") {
      const itp = itps.find((row) => row.id === item.id);
      if (itp) setDeleteTarget({ kind: "itp", itp });
      return;
    }
    const itc =
      itcs.find((row) => row.id === item.id) ?? itpPins.find((row) => row.id === item.id);
    if (itc) setDeleteTarget({ kind: "itc", itc });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    if (deleteTarget.kind === "itp") {
      const result = await deleteAdminItp(deleteTarget.itp);
      setDeleting(false);
      if (result.error) {
        setToast(result.error);
        return;
      }
      const itpId = deleteTarget.itp.id;
      setOpenItp(null);
      setOpenItc(null);
      setItpPins([]);
      setItps((current) => current.filter((row) => row.id !== itpId));
      setItcs((current) => current.filter((row) => row.itp_id !== itpId));
      setDeleteTarget(null);
      setToast("ITP and associated ITCs deleted successfully.");
      return;
    }

    const result = await deleteAdminItc(deleteTarget.itc.id);
    setDeleting(false);
    if (result.error) {
      setToast(result.error);
      return;
    }
    const itcId = deleteTarget.itc.id;
    const itcNo = deleteTarget.itc.number;
    setOpenItc((current) => (current?.id === itcId ? null : current));
    setItcs((current) => current.filter((row) => row.id !== itcId));
    setItpPins((current) => current.filter((row) => row.id !== itcId));
    setDeleteTarget(null);
    setToast(`ITC ${itcNo} deleted.`);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-orange-500">
          <ClipboardCheck className="h-4 w-4" />
          Administration
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">ITP / ITC</h1>
        <p className="text-sm text-slate-500">
          View existing plans and certificates, or create a new ITP and drop ITC pins on the drawing.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            ["view", "View / Edit Existing"],
            ["create", "Create New"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              tab === id
                ? "rounded-full bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white"
                : "rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {sessionLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          Loading Administration…
        </div>
      ) : tab === "create" ? (
        <ItpItcCreateWizard
          projects={projects.map((row) => ({ id: row.id, name: row.name }))}
          onCreated={async (itp) => {
            await loadRecords();
            setTab("view");
            await openItpDrawer(itp.id);
          }}
        />
      ) : (
        <ItpItcBrowseView
          items={browseItems}
          search={search}
          projectId={projectFilter}
          kind={kind}
          projects={projects.map((row) => ({ id: row.id, name: row.name }))}
          loading={loading}
          onSearchChange={setSearch}
          onProjectChange={setProjectFilter}
          onKindChange={setKind}
          onOpenItp={(id) => void openItpDrawer(id)}
          onOpenItc={(id) => void openItcDrawer(id)}
          onDeleteItem={requestDeleteFromBrowse}
        />
      )}

      {openItp ? (
        <ItpMasterDrawer
          key={openItp.id}
          itp={openItp}
          itcs={itpPins}
          projectName={projectName(openItp.project_id)}
          loading={loadingPins}
          onClose={() => setOpenItp(null)}
          onOpenItc={(id) => void openItcDrawer(id)}
          onSaved={(next) => {
            setOpenItp(next);
            setItps((current) => current.map((row) => (row.id === next.id ? next : row)));
          }}
          onCreatedItc={(created) => {
            setItpPins((current) =>
              current.some((row) => row.id === created.id) ? current : [...current, created]
            );
            setItcs((current) =>
              current.some((row) => row.id === created.id) ? current : [...current, created]
            );
          }}
          onRequestDeleteItp={() => setDeleteTarget({ kind: "itp", itp: openItp })}
          onRequestDeleteItc={(itc) => setDeleteTarget({ kind: "itc", itc })}
        />
      ) : null}

      {openItc ? (
        <ItcChecklistDrawer
          key={openItc.id}
          itc={openItc}
          projectName={projectName(openItc.project_id)}
          defaultSignerName={signerName}
          onClose={() => setOpenItc(null)}
          onSaved={(next) => {
            setOpenItc(next);
            setItcs((current) => current.map((row) => (row.id === next.id ? next : row)));
            setItpPins((current) => current.map((row) => (row.id === next.id ? next : row)));
          }}
          onRequestDelete={() => setDeleteTarget({ kind: "itc", itc: openItc })}
        />
      ) : null}

      <div className="relative z-[80]">
        <ConfirmDeletionDialog
          open={deleteTarget !== null}
          confirming={deleting}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={() => void handleConfirmDelete()}
        />
      </div>

      {toast ? (
        <Toast
          message={toast}
          variant={toast.toLowerCase().includes("deleted") ? "success" : "error"}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
