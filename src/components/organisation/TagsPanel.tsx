"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Toast from "@/components/ui/Toast";
import ConfirmDeletionDialog from "@/components/ui/ConfirmDeletionDialog";
import { useFormToast } from "@/hooks/useFormToast";
import {
  createTag,
  deleteTag,
  fetchTags,
  updateTag,
  type WorkerTag,
} from "@/lib/worker-tags";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";
import TagFormModal from "./TagFormModal";

function formatCreatedAt(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

export default function TagsPanel() {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [tags, setTags] = useState<WorkerTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingTag, setEditingTag] = useState<WorkerTag | null>(null);
  const [tagToDelete, setTagToDelete] = useState<WorkerTag | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { tags: rows, error } = await fetchTags();
    if (error) {
      setLoadError(error);
      setTags([]);
    } else {
      setTags(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeModal = () => {
    setShowAdd(false);
    setEditingTag(null);
  };

  const handleDelete = async (tag: WorkerTag) => {
    setDeletingId(tag.id);
    try {
      const { error } = await deleteTag(tag.id);
      if (error) {
        showError(error);
        return;
      }
      showSuccess("Tag deleted");
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const modalOpen = showAdd || editingTag !== null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Worker <span className="text-orange-500">Tags</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create labels such as NSW Worker and assign them during onboarding or from the workers list.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingTag(null);
            setShowAdd(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Add New Tag
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading tags…
        </div>
      ) : loadError ? (
        <p className={`p-6 text-sm text-red-700 ${cardClass}`}>{loadError}</p>
      ) : tags.length === 0 ? (
        <p className={`p-6 text-sm text-slate-500 ${cardClass}`}>
          No tags yet. Click Add New Tag to create one.
        </p>
      ) : (
        <div className={cn(cardClass, "overflow-x-auto")}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.id} className="border-b border-slate-100 last:border-0 hover:bg-orange-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{tag.name}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCreatedAt(tag.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingTag(tag)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-orange-700"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === tag.id}
                        onClick={() => setTagToDelete(tag)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingId === tag.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <TagFormModal
          tag={editingTag}
          onClose={closeModal}
          onSave={async (name) => {
            const result = editingTag
              ? await updateTag(editingTag.id, name)
              : await createTag(name);
            if (result.error) {
              showError(result.error);
              return { error: result.error };
            }
            showSuccess(editingTag ? "Tag updated" : "Tag created");
            await load();
            return { error: null };
          }}
        />
      ) : null}

      <ConfirmDeletionDialog
        open={tagToDelete !== null}
        confirming={Boolean(tagToDelete && deletingId === tagToDelete.id)}
        onCancel={() => setTagToDelete(null)}
        onConfirm={async () => {
          if (!tagToDelete) return;
          await handleDelete(tagToDelete);
          setTagToDelete(null);
        }}
      />

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
