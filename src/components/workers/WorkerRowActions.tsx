"use client";

import { Link2, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import { ResendInviteButton } from "@/components/workers/ResendInviteButton";
import { cn } from "@/lib/utils";

// CRITICAL: Resend Invite action must remain in row menu and worker profile modal
export function WorkerRowActions({
  worker,
  lastSignInAt,
  deleted,
  revoked,
  actionId,
  onEdit,
  onAssign,
  onRevoke,
  onDelete,
  onInviteSuccess,
  onInviteError,
}: {
  worker: Worker;
  lastSignInAt?: string | null;
  deleted: boolean;
  revoked: boolean;
  actionId?: string | null;
  onEdit: () => void;
  onAssign?: () => void;
  onRevoke: () => void;
  onDelete: () => void;
  onInviteSuccess: (message: string, inviteSentAt: string | null) => void;
  onInviteError: (message: string) => void;
}) {
  if (deleted) return null;

  return (
    <div className="flex flex-wrap gap-1.5" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-600"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </button>
      {!revoked && onAssign ? (
        <button
          type="button"
          onClick={onAssign}
          className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
        >
          <Link2 className="h-3.5 w-3.5" />
          Assign
        </button>
      ) : null}
      <ResendInviteButton
        worker={worker}
        lastSignInAt={lastSignInAt}
        onSuccess={onInviteSuccess}
        onError={onInviteError}
      />
      <button
        type="button"
        disabled={actionId === worker.id}
        onClick={onRevoke}
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50",
          revoked
            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            : "border-red-200 text-red-700 hover:bg-red-50"
        )}
      >
        {revoked ? (
          <>
            <UserCheck className="h-3.5 w-3.5" />
            Reactivate
          </>
        ) : (
          <>
            <UserX className="h-3.5 w-3.5" />
            Revoke
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {revoked ? "Move to Archive" : "Delete Worker"}
      </button>
    </div>
  );
}
