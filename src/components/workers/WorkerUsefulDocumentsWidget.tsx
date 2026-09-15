"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Loader2, Search } from "lucide-react";
import {
  fetchOrganizationDocuments,
  formatDocumentAddedDate,
  type OrganizationDocument,
} from "@/lib/organization-documents";
import { cn } from "@/lib/utils";
import { cardClass, inputClass } from "@/lib/ui-classes";

export default function WorkerUsefulDocumentsWidget() {
  const [documents, setDocuments] = useState<OrganizationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      const { data, error: loadError } = await fetchOrganizationDocuments();
      if (cancelled) return;
      if (loadError) {
        setError(loadError);
        setDocuments([]);
      } else {
        setError(null);
        setDocuments(data);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter((document) =>
      document.name.toLowerCase().includes(needle)
    );
  }, [documents, query]);

  return (
    <div className={cn(cardClass, "flex w-full flex-col gap-4 p-4")}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
          <FileText className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Useful Documents</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Search and open organisation files such as EBAs and policies.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search documents…"
          className={cn(inputClass, "pl-9")}
          aria-label="Search useful documents"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading documents…
        </div>
      ) : error ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Documents are unavailable right now.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {query.trim()
            ? "No documents match that search."
            : "No useful documents have been uploaded yet."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
          {filtered.map((document) => (
            <li
              key={document.id}
              className="flex items-start justify-between gap-3 bg-white px-3 py-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{document.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Added {formatDocumentAddedDate(document.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={document.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-orange-200 px-2.5 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-50"
                >
                  View
                </a>
                <a
                  href={document.file_url}
                  download={document.file_name || document.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3 w-3" />
                  Download
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
