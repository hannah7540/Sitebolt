"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import Toast from "@/components/ui/Toast";
import ConfirmDeletionDialog from "@/components/ui/ConfirmDeletionDialog";
import { useFormToast } from "@/hooks/useFormToast";
import {
  deleteOrganizationDocument,
  fetchOrganizationDocuments,
  formatDocumentAddedDate,
  insertOrganizationDocument,
  updateOrganizationDocument,
  type OrganizationDocument,
} from "@/lib/organization-documents";
import {
  deleteOrganizationDocumentFile,
  uploadOrganizationDocumentFile,
} from "@/lib/organization-document-upload";
import OrganisationDocumentFormModal from "./OrganisationDocumentFormModal";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

export default function OrganisationDocumentsPanel() {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [documents, setDocuments] = useState<OrganizationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingDocument, setEditingDocument] = useState<OrganizationDocument | null>(
    null
  );
  const [documentToDelete, setDocumentToDelete] = useState<OrganizationDocument | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await fetchOrganizationDocuments();
    if (error) {
      setLoadError(error);
      setDocuments([]);
    } else {
      setDocuments(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeForm = () => {
    setShowAdd(false);
    setEditingDocument(null);
    setFormError(null);
  };

  const handleCreate = async (input: { name: string; file: File | null }) => {
    if (!input.file) {
      setFormError("A file attachment is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const documentId = crypto.randomUUID();
    const upload = await uploadOrganizationDocumentFile(input.file, documentId);
    if (upload.error || !upload.url) {
      setSaving(false);
      setFormError(upload.error ?? "Upload failed.");
      return;
    }

    const result = await insertOrganizationDocument({
      id: documentId,
      name: input.name,
      file_url: upload.url,
      file_name: input.file.name,
      file_size: input.file.size,
    });

    if (result.error) {
      await deleteOrganizationDocumentFile(upload.url);
      setSaving(false);
      setFormError(result.error);
      return;
    }

    setSaving(false);
    showSuccess("Document added");
    closeForm();
    await load();
  };

  const handleUpdate = async (input: { name: string; file: File | null }) => {
    if (!editingDocument) return;
    setSaving(true);
    setFormError(null);

    let nextUrl = editingDocument.file_url;
    let nextFileName = editingDocument.file_name;
    let nextFileSize = editingDocument.file_size;

    if (input.file) {
      const upload = await uploadOrganizationDocumentFile(
        input.file,
        editingDocument.id
      );
      if (upload.error || !upload.url) {
        setSaving(false);
        setFormError(upload.error ?? "Upload failed.");
        return;
      }
      await deleteOrganizationDocumentFile(editingDocument.file_url);
      nextUrl = upload.url;
      nextFileName = input.file.name;
      nextFileSize = input.file.size;
    }

    const result = await updateOrganizationDocument(editingDocument.id, {
      name: input.name,
      file_url: nextUrl,
      file_name: nextFileName,
      file_size: nextFileSize,
    });

    if (result.error) {
      setSaving(false);
      setFormError(result.error);
      return;
    }

    setSaving(false);
    showSuccess("Document updated");
    closeForm();
    await load();
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;
    setDeleting(true);
    const { error } = await deleteOrganizationDocument(documentToDelete.id);
    if (error) {
      setDeleting(false);
      showError(error);
      return;
    }
    await deleteOrganizationDocumentFile(documentToDelete.file_url);
    setDeleting(false);
    setDocumentToDelete(null);
    showSuccess("Document deleted");
    await load();
  };

  const modalOpen = showAdd || editingDocument !== null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Organisation <span className="text-orange-500">Documents</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Upload files workers can open from Useful Documents on their dashboard.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingDocument(null);
            setFormError(null);
            setShowAdd(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Add Document
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading documents…
        </div>
      ) : loadError ? (
        <p className={`p-6 text-sm text-red-700 ${cardClass}`}>{loadError}</p>
      ) : documents.length === 0 ? (
        <p className={`p-6 text-sm text-slate-500 ${cardClass}`}>
          No organisation documents uploaded yet.
        </p>
      ) : (
        <div className={cn(cardClass, "overflow-x-auto")}>
          <table className="min-w-[640px] w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Date Added</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-orange-50/50"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {item.name}
                    {item.file_name ? (
                      <p className="text-xs font-normal text-slate-500">{item.file_name}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDocumentAddedDate(item.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={item.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-50"
                      >
                        View
                      </a>
                      <a
                        href={item.file_url}
                        download={item.file_name || item.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdd(false);
                          setFormError(null);
                          setEditingDocument(item);
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-orange-700"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocumentToDelete(item)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
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
        <OrganisationDocumentFormModal
          document={editingDocument}
          saving={saving}
          error={formError}
          onClose={() => {
            if (!saving) closeForm();
          }}
          onSubmit={editingDocument ? handleUpdate : handleCreate}
        />
      ) : null}

      <ConfirmDeletionDialog
        open={documentToDelete !== null}
        confirming={deleting}
        onCancel={() => {
          if (!deleting) setDocumentToDelete(null);
        }}
        onConfirm={() => void handleDelete()}
      />

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
