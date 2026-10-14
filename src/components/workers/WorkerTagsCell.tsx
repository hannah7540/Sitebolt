"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import AutocompleteField from "@/components/ui/AutocompleteField";
import ConfirmDeletionDialog from "@/components/ui/ConfirmDeletionDialog";
import {
  assignTagToWorker,
  removeTagFromWorker,
  type WorkerTag,
} from "@/lib/worker-tags";
import { cn } from "@/lib/utils";

interface WorkerTagsCellProps {
  workerId: string;
  assignedTags: WorkerTag[];
  allTags: WorkerTag[];
  onChanged: () => void;
  onError: (message: string) => void;
}

export default function WorkerTagsCell({
  workerId,
  assignedTags,
  allTags,
  onChanged,
  onError,
}: WorkerTagsCellProps) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<WorkerTag | null>(null);
  const [busy, setBusy] = useState(false);

  const unassignedOptions = useMemo(
    () =>
      allTags
        .filter((tag) => !assignedTags.some((assigned) => assigned.id === tag.id))
        .map((tag) => ({ id: tag.id, label: tag.name })),
    [allTags, assignedTags]
  );

  const handleAssign = async (tagId: string | null) => {
    if (!tagId) return;
    setBusy(true);
    try {
      const { error } = await assignTagToWorker(workerId, tagId);
      if (error) {
        onError(error);
        return;
      }
      setAssignOpen(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!pendingRemove) return;
    setBusy(true);
    try {
      const { error } = await removeTagFromWorker(workerId, pendingRemove.id);
      if (error) {
        onError(error);
        return;
      }
      setPendingRemove(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-w-[10rem] flex-wrap items-center gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      {assignedTags.length === 0 && !assignOpen ? (
        <span className="text-slate-400">—</span>
      ) : null}

      {assignedTags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-900"
        >
          <span className="truncate">{tag.name}</span>
          <button
            type="button"
            onClick={() => setPendingRemove(tag)}
            disabled={busy}
            className="rounded-full p-0.5 text-orange-700 hover:bg-orange-100 disabled:opacity-50"
            aria-label={`Remove ${tag.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {assignOpen ? (
        <div className="min-w-[12rem] flex-1">
          <AutocompleteField
            id={`assign-tag-${workerId}`}
            mode="single"
            allowClear={false}
            selected={null}
            onChange={(tagId) => void handleAssign(tagId)}
            options={unassignedOptions}
            disabled={busy}
            placeholder="Select tag…"
            emptyMessage="No more tags to assign."
            noMatchesMessage="No tags match your search."
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAssignOpen(true)}
          disabled={busy}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50",
            unassignedOptions.length === 0 && allTags.length > 0 && "opacity-40"
          )}
          aria-label="Assign tag"
          title="Assign tag"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      )}

      <ConfirmDeletionDialog
        open={pendingRemove !== null}
        confirming={busy && pendingRemove !== null}
        title="Remove tag"
        message="Are you sure you want to remove this tag?"
        confirmLabel="Remove"
        onCancel={() => {
          if (!busy) setPendingRemove(null);
        }}
        onConfirm={() => void handleRemove()}
      />
    </div>
  );
}
