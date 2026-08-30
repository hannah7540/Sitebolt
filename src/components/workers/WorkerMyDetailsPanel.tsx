"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, AlertTriangle, ExternalLink, Pencil, ZoomIn } from "lucide-react";
import type { Worker, WorkerVoc } from "@/lib/supabase";
import {
  fetchWorkerVocs,
  insertWorkerVocs,
  updateWorker,
  updateWorkerStatusFromVocs,
} from "@/lib/supabase";
import { uploadWorkerDocumentSafe } from "@/lib/worker-doc-upload";
import {
  getTicketBadgeLabel,
  getWorkerTicketStatus,
  getAllExpiryWarnings,
} from "@/lib/worker-compliance";
import { getTicketStatus, buildWorkerFullName, nullIfBlankWorkerDate } from "@/lib/worker-utils";
import { splitWorkerName } from "@/lib/worker-cards-vocs";
import type { VocDraft } from "@/lib/voc-utils";
import { getVocDisplayTitle } from "@/lib/voc-utils";
import DocumentCapture from "@/components/ui/DocumentCapture";
import ImageLightboxGallery from "@/components/ui/ImageLightboxGallery";
import EditVocModal from "@/components/workers/EditVocModal";
import VocListEditor from "./VocListEditor";
import { cn } from "@/lib/utils";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
  sectionClass,
} from "@/lib/ui-classes";

interface WorkerMyDetailsPanelProps {
  worker: Worker;
  initialVocs?: WorkerVoc[];
  onClose: () => void;
  onSaved: (worker: Worker) => void;
}

interface DocFiles {
  white_card: File | null;
  silica_cert: File | null;
}

interface DocUrls {
  white_card: string | null;
  silica_cert: string | null;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function ExistingVocCard({
  voc,
  onOpen,
}: {
  voc: WorkerVoc;
  onOpen: () => void;
}) {
  const status = getTicketStatus(voc.expiry_date);
  const styles = {
    valid: "border-emerald-200 bg-emerald-50",
    expires_soon: "border-amber-200 bg-amber-50",
    expired: "border-red-200 bg-red-50",
    unknown: "border-slate-200 bg-slate-50",
  };
  const badgeStyles = {
    valid: "bg-emerald-100 text-emerald-800",
    expires_soon: "bg-amber-100 text-amber-800",
    expired: "bg-red-100 text-red-800",
    unknown: "bg-slate-100 text-slate-600",
  };
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const hasImage =
    Boolean(voc.document_url) &&
    !String(voc.document_url).toLowerCase().includes(".pdf");

  return (
    <div className={cn("rounded-xl border p-3", styles[status])}>
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="min-w-0 text-left">
          <p className="text-sm font-semibold text-slate-900 hover:text-orange-700">
            {getVocDisplayTitle(voc)}
          </p>
          {voc.issuing_org && (
            <p className="text-xs text-slate-500">{voc.issuing_org}</p>
          )}
        </button>
        <span
          className={cn(
            "shrink-0 rounded px-2 py-0.5 text-xs font-bold",
            badgeStyles[status]
          )}
        >
          {getTicketBadgeLabel(status)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
        <span>Issued: {voc.issue_date ?? "—"}</span>
        <span>Expires: {voc.expiry_date ?? "—"}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {hasImage && voc.document_url ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="group relative h-12 w-12 overflow-hidden rounded-lg border border-slate-200 bg-white"
            aria-label="Preview VOC document"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={voc.document_url}
              alt={getVocDisplayTitle(voc)}
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30">
              <ZoomIn className="h-3.5 w-3.5 text-white opacity-0 group-hover:opacity-100" />
            </span>
          </button>
        ) : voc.document_url ? (
          <a
            href={voc.document_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> View document
          </a>
        ) : null}
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:border-orange-300"
        >
          <Pencil className="h-3 w-3" /> Edit VOC
        </button>
      </div>
      {lightboxOpen && voc.document_url ? (
        <ImageLightboxGallery
          images={[{ url: voc.document_url, alt: getVocDisplayTitle(voc) }]}
          initialIndex={0}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default function WorkerMyDetailsPanel({
  worker,
  initialVocs = [],
  onClose,
  onSaved,
}: WorkerMyDetailsPanelProps) {
  const uploadPrefixRef = useRef(`workers/${worker.id}/profile/${Date.now()}`);
  const uploadPrefix = uploadPrefixRef.current;

  const initialNames = splitWorkerName(worker);
  const [firstName, setFirstName] = useState(initialNames.firstName);
  const [lastName, setLastName] = useState(initialNames.lastName);
  const [phone, setPhone] = useState(worker.phone ?? "");
  const [dob, setDob] = useState(worker.dob ?? "");
  const [addressLine1, setAddressLine1] = useState(worker.address_line_1 ?? "");
  const [addressLine2, setAddressLine2] = useState(worker.address_line_2 ?? "");
  const [suburb, setSuburb] = useState(worker.suburb ?? "");
  const [postcode, setPostcode] = useState(worker.postcode ?? "");
  const [emergencyName, setEmergencyName] = useState(
    worker.emergency_contact_name ?? ""
  );
  const [emergencyPhone, setEmergencyPhone] = useState(
    worker.emergency_contact_phone ?? ""
  );
  const [emergencyRelationship, setEmergencyRelationship] = useState(
    worker.emergency_contact_relationship ?? ""
  );
  const [whiteCardNumber, setWhiteCardNumber] = useState(
    worker.white_card_number ?? ""
  );
  const [whiteCardIssueDate, setWhiteCardIssueDate] = useState(
    worker.white_card_issue_date ?? ""
  );
  const [silicaNumber, setSilicaNumber] = useState(
    worker.silica_cert_number ?? ""
  );
  const [silicaIssueDate, setSilicaIssueDate] = useState(
    worker.silica_cert_issue_date ?? ""
  );

  const [docs, setDocs] = useState<DocFiles>({
    white_card: null,
    silica_cert: null,
  });
  const [docUrls, setDocUrls] = useState<DocUrls>({
    white_card: worker.white_card_photo_url,
    silica_cert: worker.silica_cert_photo_url,
  });

  const [existingVocs, setExistingVocs] = useState<WorkerVoc[]>(initialVocs);
  const [newVocs, setNewVocs] = useState<VocDraft[]>([]);
  const [editingVoc, setEditingVoc] = useState<WorkerVoc | null>(null);
  const [loadingVocs, setLoadingVocs] = useState(initialVocs.length === 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialVocs.length > 0) {
      setExistingVocs(initialVocs);
      setLoadingVocs(false);
      return;
    }
    let cancelled = false;
    fetchWorkerVocs(worker.id).then((data) => {
      if (!cancelled) {
        setExistingVocs(data);
        setLoadingVocs(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [worker.id, initialVocs]);

  const ticketStatus = getWorkerTicketStatus(
    { ...worker, drivers_licence_expiry: worker.drivers_licence_expiry },
    existingVocs
  );
  const warnings = getAllExpiryWarnings(worker, existingVocs);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let whiteCardUrl = docUrls.white_card ?? worker.white_card_photo_url ?? null;
      let silicaUrl = docUrls.silica_cert ?? worker.silica_cert_photo_url ?? null;

      if (docs.white_card) {
        const uploaded = await uploadWorkerDocumentSafe(
          docs.white_card,
          `${uploadPrefix}/white-card`
        );
        if (!uploaded) {
          throw new Error("Failed to upload white card photo.");
        }
        whiteCardUrl = uploaded;
      }

      if (docs.silica_cert) {
        const uploaded = await uploadWorkerDocumentSafe(
          docs.silica_cert,
          `${uploadPrefix}/silica-cert`
        );
        if (!uploaded) {
          throw new Error("Failed to upload silica certificate photo.");
        }
        silicaUrl = uploaded;
      }

      const { error: updateError } = await updateWorker(worker.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
        dob: nullIfBlankWorkerDate(dob),
        address_line_1: addressLine1.trim() || null,
        address_line_2: addressLine2.trim() || null,
        suburb: suburb.trim() || null,
        postcode: postcode.trim() || null,
        emergency_contact_name: emergencyName.trim() || null,
        emergency_contact_phone: emergencyPhone.trim() || null,
        emergency_contact_relationship: emergencyRelationship.trim() || null,
        white_card_number: whiteCardNumber.trim() || null,
        white_card_issue_date: nullIfBlankWorkerDate(whiteCardIssueDate),
        white_card_photo_url: whiteCardUrl,
        silica_cert_number: silicaNumber.trim() || null,
        silica_cert_issue_date: nullIfBlankWorkerDate(silicaIssueDate),
        silica_cert_photo_url: silicaUrl,
      });

      if (updateError) {
        setError(updateError);
        return;
      }

      const vocItems = newVocs.filter((v) => getVocDisplayTitle(v).trim());
      let allVocs = existingVocs;

      if (vocItems.length > 0) {
        const missingType = vocItems.find((voc) => !voc.voc_type.trim());
        if (missingType) {
          setError("Please select a VOC type for each new VOC.");
          setSaving(false);
          return;
        }

        const prepared = await Promise.all(
          vocItems.map(async (voc, i) => {
            const vocType = getVocDisplayTitle(voc);
            let documentUrl = voc.document_url ?? null;
            if (!documentUrl && voc.file) {
              documentUrl = await uploadWorkerDocumentSafe(
                voc.file,
                `${uploadPrefix}/vocs/${i}-${vocType.replace(/[^a-z0-9]/gi, "_")}`
              );
              if (!documentUrl) {
                throw new Error(`Failed to upload VOC document for ${vocType}.`);
              }
            }
            return {
              title: vocType,
              voc_type: vocType,
              issuing_org: voc.issuing_org || null,
              issue_date: nullIfBlankWorkerDate(voc.issue_date),
              expiry_date: nullIfBlankWorkerDate(voc.expiry_date),
              document_url: documentUrl,
            };
          })
        );

        const { error: vocError } = await insertWorkerVocs(worker.id, prepared);
        if (vocError) {
          setError(vocError);
          return;
        }

        allVocs = await fetchWorkerVocs(worker.id);
        setExistingVocs(allVocs);
        setNewVocs([]);
      }

      const { error: statusError } = await updateWorkerStatusFromVocs(
        worker.id,
        worker.drivers_licence_expiry,
        allVocs.map((v) => v.expiry_date)
      );
      if (statusError) {
        throw new Error(statusError);
      }

      onSaved({
        ...worker,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        full_name: buildWorkerFullName(firstName, lastName),
        phone: phone.trim() || null,
        dob: dob || null,
        address_line_1: addressLine1.trim() || null,
        address_line_2: addressLine2.trim() || null,
        suburb: suburb.trim() || null,
        postcode: postcode.trim() || null,
        emergency_contact_name: emergencyName.trim() || null,
        emergency_contact_phone: emergencyPhone.trim() || null,
        emergency_contact_relationship: emergencyRelationship.trim() || null,
        white_card_number: whiteCardNumber.trim() || null,
        white_card_issue_date: whiteCardIssueDate || null,
        white_card_photo_url: whiteCardUrl,
        silica_cert_number: silicaNumber.trim() || null,
        silica_cert_issue_date: silicaIssueDate || null,
        silica_cert_photo_url: silicaUrl,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <div className={cn(modalClass, "max-w-lg")}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-500 hover:text-slate-900"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-slate-900">My Details & Compliance</h2>
        <p className="mt-1 text-sm text-slate-500">
          {buildWorkerFullName(firstName, lastName) || worker.full_name}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-slate-500">Compliance:</span>
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs font-bold",
              ticketStatus === "valid" && "bg-emerald-100 text-emerald-800",
              ticketStatus === "expires_soon" && "bg-amber-100 text-amber-800",
              ticketStatus === "expired" && "bg-red-100 text-red-800",
              ticketStatus === "unknown" && "bg-slate-100 text-slate-600"
            )}
          >
            {getTicketBadgeLabel(ticketStatus)}
          </span>
        </div>

        {warnings.length > 0 && (
          <ul className="mt-2 space-y-1">
            {warnings.map((w) => (
              <li
                key={w}
                className="flex items-center gap-1.5 text-xs text-amber-700"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {w}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-4 space-y-4">
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-orange-600">Personal</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First Name *">
                <input
                  className={inputClass}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </Field>
              <Field label="Last Name *">
                <input
                  className={inputClass}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </Field>
            </div>
            <Field label="Phone Number">
              <input
                type="tel"
                className={inputClass}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field label="Address Line 1">
              <input
                className={inputClass}
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                autoComplete="address-line1"
              />
            </Field>
            <Field label="Address Line 2 (Optional)">
              <input
                className={inputClass}
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                autoComplete="address-line2"
              />
            </Field>
            <Field label="Suburb / City">
              <input
                className={inputClass}
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                autoComplete="address-level2"
              />
            </Field>
            <Field label="Postal / Zip Code">
              <input
                className={inputClass}
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                autoComplete="postal-code"
              />
            </Field>
            <Field label="Date of Birth">
              <input
                type="date"
                className={inputClass}
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </Field>
          </div>

          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-orange-600">
              Emergency Contact
            </h3>
            <Field label="Contact Name">
              <input
                className={inputClass}
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
              />
            </Field>
            <Field label="Phone Number">
              <input
                type="tel"
                className={inputClass}
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
              />
            </Field>
            <Field label="Relationship">
              <input
                className={inputClass}
                placeholder="e.g. Spouse, Parent"
                value={emergencyRelationship}
                onChange={(e) => setEmergencyRelationship(e.target.value)}
              />
            </Field>
          </div>

          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-orange-600">White Card</h3>
            <Field label="Card Number">
              <input
                className={inputClass}
                value={whiteCardNumber}
                onChange={(e) => setWhiteCardNumber(e.target.value)}
              />
            </Field>
            <Field label="Issue Date">
              <input
                type="date"
                className={inputClass}
                value={whiteCardIssueDate}
                onChange={(e) => setWhiteCardIssueDate(e.target.value)}
              />
            </Field>
            <DocumentCapture
              label="White Card Photo"
              file={docs.white_card}
              onFileChange={(f) => setDocs((d) => ({ ...d, white_card: f }))}
              existingUrl={worker.white_card_photo_url}
              uploadedUrl={docUrls.white_card}
              uploadPath={`${uploadPrefix}/white-card`}
              onUploaded={(url) =>
                setDocUrls((d) => ({ ...d, white_card: url }))
              }
            />
          </div>

          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-orange-600">
              Silica Certificate
            </h3>
            <Field label="Certificate Number">
              <input
                className={inputClass}
                value={silicaNumber}
                onChange={(e) => setSilicaNumber(e.target.value)}
              />
            </Field>
            <Field label="Issue Date">
              <input
                type="date"
                className={inputClass}
                value={silicaIssueDate}
                onChange={(e) => setSilicaIssueDate(e.target.value)}
              />
            </Field>
            <DocumentCapture
              label="Silica Certificate Photo"
              file={docs.silica_cert}
              onFileChange={(f) => setDocs((d) => ({ ...d, silica_cert: f }))}
              existingUrl={worker.silica_cert_photo_url}
              uploadedUrl={docUrls.silica_cert}
              uploadPath={`${uploadPrefix}/silica-cert`}
              onUploaded={(url) =>
                setDocUrls((d) => ({ ...d, silica_cert: url }))
              }
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-orange-600">Your VOCs</h3>
            {loadingVocs ? (
              <p className="mt-2 text-sm text-slate-500">Loading VOCs…</p>
            ) : existingVocs.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No VOCs on file yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {existingVocs.map((voc) => (
                  <ExistingVocCard
                    key={voc.id}
                    voc={voc}
                    onOpen={() => setEditingVoc(voc)}
                  />
                ))}
              </div>
            )}
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Add New VOCs
              </h4>
              <VocListEditor
                vocs={newVocs}
                onChange={setNewVocs}
                minItems={0}
                uploadPathPrefix={`${uploadPrefix}/vocs`}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-slate-100 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>
      </div>

      {editingVoc ? (
        <EditVocModal
          voc={editingVoc}
          workerId={worker.id}
          onClose={() => setEditingVoc(null)}
          onSaved={async (updated) => {
            const next = existingVocs.map((row) =>
              row.id === updated.id ? updated : row
            );
            setExistingVocs(next);
            setEditingVoc(null);
            await updateWorkerStatusFromVocs(
              worker.id,
              worker.drivers_licence_expiry,
              next.map((v) => v.expiry_date)
            );
            onSaved({ ...worker });
          }}
        />
      ) : null}
    </div>
  );
}
