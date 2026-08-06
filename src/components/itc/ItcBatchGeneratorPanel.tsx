"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import ItcBatchTableEditor from "@/components/itc/ItcBatchTableEditor";
import ItcCompletedPrintView from "@/components/itc/ItcCompletedPrintView";
import ItpDrawingUploader from "@/components/itc/ItpDrawingUploader";
import {
  createBatchItemFromPin,
  fetchBatchItems,
  fetchServiceSpecRules,
  massSaveAndGenerateItcs,
  type ItcDrawingPin,
  type ItcProjectDrawing,
} from "@/lib/itc-batch-service";
import type { ItcBatchItemDraft, ItcCompletedDocument, ItcServiceSpecRule } from "@/lib/itc-batch-templates";
import { inputClass } from "@/lib/ui-classes";

interface ItcBatchGeneratorPanelProps {
  projectId: string;
  projectName: string;
  uploadedBy?: string;
  onGenerated: () => void;
}

export default function ItcBatchGeneratorPanel({
  projectId,
  projectName,
  uploadedBy,
  onGenerated,
}: ItcBatchGeneratorPanelProps) {
  const [drawing, setDrawing] = useState<ItcProjectDrawing | null>(null);
  const [pins, setPins] = useState<ItcDrawingPin[]>([]);
  const [batchItems, setBatchItems] = useState<ItcBatchItemDraft[]>([]);
  const [specRules, setSpecRules] = useState<ItcServiceSpecRule[]>([]);
  const [packageName, setPackageName] = useState("");
  const [clientName, setClientName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [documents, setDocuments] = useState<ItcCompletedDocument[]>([]);
  const [activeDocumentIndex, setActiveDocumentIndex] = useState(0);

  const loadSpecRules = useCallback(async () => {
    const rules = await fetchServiceSpecRules();
    setSpecRules(rules);
  }, []);

  const loadBatchItems = useCallback(async () => {
    const rows = await fetchBatchItems(projectId);
    if (rows.length > 0) {
      setBatchItems(rows);
    }
  }, [projectId]);

  useEffect(() => {
    void loadSpecRules();
    void loadBatchItems();
  }, [loadSpecRules, loadBatchItems]);

  const handlePinAdded = (pin: ItcDrawingPin) => {
    setPins((current) => [...current, pin]);
    setBatchItems((current) => [...current, createBatchItemFromPin(pin)]);
  };

  const handleMassSave = async () => {
    setLoading(true);
    setMessage(null);

    const result = await massSaveAndGenerateItcs({
      projectId,
      drawingId: drawing?.id ?? null,
      items: batchItems,
      projectNo: projectId,
      packageName: packageName || projectName,
      clientName,
    });

    setLoading(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }

    setDocuments(result.documents);
    setActiveDocumentIndex(0);
    setMessage(`Generated ${result.generated} ITC document(s).`);
    onGenerated();
  };

  const activeDocument = documents[activeDocumentIndex] ?? null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Package</span>
          <input
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            placeholder={projectName}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Client</span>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className={inputClass}
            placeholder="Client name"
          />
        </label>
      </div>

      <ItpDrawingUploader
        projectId={projectId}
        uploadedBy={uploadedBy}
        pins={pins}
        onDrawingUploaded={setDrawing}
        onPinAdded={handlePinAdded}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Grouped Batch Table Editor</h3>
          <p className="text-sm text-slate-500">
            Sorted by service type with auto-lookup from service spec rules.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || batchItems.length === 0}
          onClick={() => void handleMassSave()}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Mass Save & Generate ITCs
        </button>
      </div>

      <ItcBatchTableEditor items={batchItems} specRules={specRules} onChange={setBatchItems} />

      {message ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
      ) : null}

      {documents.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {documents.map((doc, index) => (
              <button
                key={doc.itc_id}
                type="button"
                onClick={() => setActiveDocumentIndex(index)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  activeDocumentIndex === index
                    ? "bg-orange-600 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {doc.itc_number}
              </button>
            ))}
          </div>

          {activeDocument ? (
            <ItcCompletedPrintView document={activeDocument} projectName={projectName} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
