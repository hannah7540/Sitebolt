"use client";

import { Mail, Phone, UserRound } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import type { DbProject } from "@/lib/project-resolver";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import WorkerProfileAvatar from "@/components/ui/WorkerProfileAvatar";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ProjectPersonnelCardProps {
  project: DbProject | null;
  workers: Worker[];
  onEditPersonnel?: () => void;
  className?: string;
}

function PersonnelRow({
  worker,
  roleLabel,
  compact = false,
}: {
  worker: Worker | undefined;
  roleLabel: string;
  compact?: boolean;
}) {
  if (!worker) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2">
        {!compact ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {roleLabel}
            </p>
            <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              Unassigned
            </span>
          </div>
        ) : (
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            Unassigned
          </span>
        )}
      </div>
    );
  }

  const name = getWorkerDisplayName(worker);
  const contact = worker.email?.trim() || worker.phone?.trim() || "No contact on file";
  const contactIsEmail = Boolean(worker.email?.trim());

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <WorkerProfileAvatar
        photoUrl={worker.photo_url}
        worker={worker}
        displayName={name}
        size="md"
        className="h-10 w-10 text-sm"
      />
      <div className="min-w-0 flex-1">
        {!compact ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {roleLabel}
          </p>
        ) : null}
        <p className="truncate font-semibold text-slate-900">{name}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-600">
          {contactIsEmail ? (
            <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          ) : (
            <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          )}
          <span className="truncate">{contact}</span>
        </p>
      </div>
    </div>
  );
}

function PersonnelGroup({
  title,
  workerIds,
  workersById,
}: {
  title: string;
  workerIds: string[];
  workersById: Map<string, Worker>;
}) {
  const assigned = workerIds
    .map((id) => workersById.get(id))
    .filter((worker): worker is Worker => worker != null);

  if (assigned.length === 0) {
    return <PersonnelRow roleLabel={title} worker={undefined} />;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {assigned.map((worker) => (
        <PersonnelRow key={worker.id} roleLabel={title} worker={worker} compact />
      ))}
    </div>
  );
}

export default function ProjectPersonnelCard({
  project,
  workers,
  onEditPersonnel,
  className,
}: ProjectPersonnelCardProps) {
  const workersById = new Map(workers.map((worker) => [worker.id, worker]));
  const managers = project?.project_managers ?? [];
  const administrators =
    project?.project_administrators ?? project?.project_admins ?? [];
  const hasAssignments = managers.length > 0 || administrators.length > 0;

  return (
    <div className={cn(cardClass, "w-full max-w-sm p-4", className)}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
            <UserRound className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Project Personnel</h2>
            <p className="text-xs text-slate-500">Managers &amp; administrators</p>
          </div>
        </div>
        {onEditPersonnel ? (
          <button
            type="button"
            onClick={onEditPersonnel}
            className="shrink-0 text-xs font-semibold text-orange-600 hover:text-orange-700"
          >
            {hasAssignments ? "Edit" : "Assign"}
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        <PersonnelGroup title="Project Manager" workerIds={managers} workersById={workersById} />
        <PersonnelGroup
          title="Project Administrator"
          workerIds={administrators}
          workersById={workersById}
        />
      </div>

      {!hasAssignments && onEditPersonnel ? (
        <button
          type="button"
          onClick={onEditPersonnel}
          className="mt-3 w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-orange-300 hover:text-orange-700"
        >
          Assign project personnel
        </button>
      ) : null}
    </div>
  );
}
