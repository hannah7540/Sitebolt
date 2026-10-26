"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, AlertTriangle, ExternalLink, Pencil, ZoomIn } from "lucide-react";
import type { Worker, WorkerVoc } from "@/lib/supabase";
import {
  fetchWorkerVocs,
  insertWorkerVocs,
  updateWorkerStatusFromVocs,
} from "@/lib/supabase";
import {
  getWorkerFinancialDetails,
  updateWorkerPersonalAndFinancialDetails,
  updateWorkerTicketDetails,
} from "@/app/actions/update-worker-financials";
import { uploadWorkerDocumentSafe } from "@/lib/worker-doc-upload";
import {
  getTicketBadgeLabel,
  getWorkerTicketStatus,
  getAllExpiryWarnings,
} from "@/lib/worker-compliance";
import { formatWorkerBsb, getTicketStatus, nullIfBlankWorkerDate } from "@/lib/worker-utils";
import { splitWorkerName } from "@/lib/worker-cards-vocs";
import type { VocDraft } from "@/lib/voc-utils";
import {
  getVocDisplayTitle,
  getVocStoredType,
  isVocTypeComplete,
  validateVocDrafts,
} from "@/lib/voc-utils";
import DocumentCapture from "@/components/ui/DocumentCapture";
import ImageLightboxGallery from "@/components/ui/ImageLightboxGallery";
import EditVocModal from "@/components/workers/EditVocModal";
import VocListEditor from "./VocListEditor";
import { cn } from "@/lib/utils";
import {
  modalOverlayClass,
  modalShellClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  inputClass,
  labelClass,
  sectionClass,
} from "@/lib/ui-classes";
import { useOrganisationWorkspace } from "@/components/organisation/OrganisationWorkspaceProvider";
import { isWorkerFieldEnabled } from "@/lib/organisation-feature-flags";
import ModalActionFooter from "@/components/ui/ModalActionFooter";

type DetailsTab = "tickets" | "personal-financial";

interface WorkerMyDetailsPanelProps {
  worker: Worker;
  initialVocs?: WorkerVoc[];
  onClose: () => void;
  onSaved: (worker: Worker) => void;
}

interface DocFiles {
  white_card: File | null;
  silica_cert: File | null;
  drivers_licence: File | null;
}

interface DocUrls {
  white_card: string | null;
  silica_cert: string | null;
  drivers_licence: string | null;
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1" htmlFor={htmlFor}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
  const router = useRouter();
  const workspace = useOrganisationWorkspace();
  const flags = workspace?.featureFlags;
  const orgId = workspace?.activeCompany?.id ?? null;
  const showEmergencyContact = isWorkerFieldEnabled(flags, "emergency_contact", orgId);
  const showWhiteCard = isWorkerFieldEnabled(flags, "white_card", orgId);
  const showDriversLicence = isWorkerFieldEnabled(flags, "drivers_licence", orgId);
  const showHighRisk = isWorkerFieldEnabled(flags, "high_risk_licences", orgId);
  const uploadPrefixRef = useRef(`workers/${worker.id}/profile/${Date.now()}`);
  const uploadPrefix = uploadPrefixRef.current;

  const [tab, setTab] = useState<DetailsTab>("tickets");

  const initialNames = splitWorkerName(worker);
  const [firstName, setFirstName] = useState(initialNames.firstName);
  const [lastName, setLastName] = useState(initialNames.lastName);
  const [email, setEmail] = useState(worker.email ?? "");
  const [phone, setPhone] = useState(worker.phone ?? "");
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

  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankBsb, setBankBsb] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [superFund, setSuperFund] = useState("");
  const [superMemberNumber, setSuperMemberNumber] = useState("");
  const [tfn, setTfn] = useState("");
  const [loadingFinancials, setLoadingFinancials] = useState(false);
  const [financialsLoaded, setFinancialsLoaded] = useState(false);

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
  const [driversLicenceNumber, setDriversLicenceNumber] = useState(
    worker.drivers_licence_number ?? ""
  );
  const [driversLicenceClass, setDriversLicenceClass] = useState(
    worker.drivers_licence_class ?? ""
  );
  const [driversLicenceExpiry, setDriversLicenceExpiry] = useState(
    worker.drivers_licence_expiry ?? ""
  );

  const [docs, setDocs] = useState<DocFiles>({
    white_card: null,
    silica_cert: null,
    drivers_licence: null,
  });
  const [docUrls, setDocUrls] = useState<DocUrls>({
    white_card: worker.white_card_photo_url,
    silica_cert: worker.silica_cert_photo_url,
    drivers_licence: worker.drivers_licence_photo_url,
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

  useEffect(() => {
    if (tab !== "personal-financial" || financialsLoaded) return;
    let cancelled = false;
    setLoadingFinancials(true);
    setError(null);

    void getWorkerFinancialDetails(worker.id).then((result) => {
      if (cancelled) return;
      if (result.error || !result.values) {
        setError(result.error ?? "Failed to load financial details.");
        setLoadingFinancials(false);
        return;
      }
      setBankName(result.values.bank_name ?? "");
      setAccountName(result.values.bank_account_name ?? "");
      setBankBsb(result.values.bank_bsb ?? "");
      setBankAccountNumber(result.values.bank_account_number ?? "");
      setSuperFund(result.values.super_fund ?? "");
      setSuperMemberNumber(result.values.super_member_number ?? "");
      setTfn(result.values.tfn ?? "");
      setFinancialsLoaded(true);
      setLoadingFinancials(false);
    });

    return () => {
      cancelled = true;
    };
  }, [tab, financialsLoaded, worker.id]);

  const ticketStatus = getWorkerTicketStatus(
    { ...worker, drivers_licence_expiry: driversLicenceExpiry || worker.drivers_licence_expiry },
    existingVocs
  );
  const warnings = getAllExpiryWarnings(
    { ...worker, drivers_licence_expiry: driversLicenceExpiry || worker.drivers_licence_expiry },
    existingVocs
  );

  const handleSaveTickets = async () => {
    setSaving(true);
    setError(null);

    try {
      let whiteCardUrl = docUrls.white_card ?? worker.white_card_photo_url ?? null;
      let silicaUrl = docUrls.silica_cert ?? worker.silica_cert_photo_url ?? null;
      let driversLicenceUrl =
        docUrls.drivers_licence ?? worker.drivers_licence_photo_url ?? null;

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

      if (docs.drivers_licence) {
        const uploaded = await uploadWorkerDocumentSafe(
          docs.drivers_licence,
          `${uploadPrefix}/drivers-licence`
        );
        if (!uploaded) {
          throw new Error("Failed to upload driver's licence photo.");
        }
        driversLicenceUrl = uploaded;
      }

      const ticketResult = await updateWorkerTicketDetails({
        workerId: worker.id,
        whiteCardNumber,
        whiteCardIssueDate,
        whiteCardPhotoUrl: whiteCardUrl,
        silicaCertNumber: silicaNumber,
        silicaCertIssueDate: silicaIssueDate,
        silicaCertPhotoUrl: silicaUrl,
        driversLicenceNumber,
        driversLicenceClass,
        driversLicenceExpiry,
        driversLicencePhotoUrl: driversLicenceUrl,
      });
      if (ticketResult.error) {
        setError(ticketResult.error);
        return;
      }

      const vocError = validateVocDrafts(newVocs);
      if (vocError) {
        setError(vocError);
        return;
      }

      const vocItems = newVocs.filter((v) => isVocTypeComplete(getVocStoredType(v)));
      let allVocs = existingVocs;

      if (vocItems.length > 0) {
        const prepared = await Promise.all(
          vocItems.map(async (voc, i) => {
            const vocType = getVocStoredType(voc);
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
              secondary_vocs: voc.secondary_vocs ?? [],
            };
          })
        );

        const { error: insertError } = await insertWorkerVocs(worker.id, prepared);
        if (insertError) {
          setError(insertError);
          return;
        }

        allVocs = await fetchWorkerVocs(worker.id);
        setExistingVocs(allVocs);
        setNewVocs([]);
      }

      const { error: statusError } = await updateWorkerStatusFromVocs(
        worker.id,
        driversLicenceExpiry || worker.drivers_licence_expiry,
        allVocs.map((v) => v.expiry_date)
      );
      if (statusError) {
        throw new Error(statusError);
      }

      onSaved({
        ...worker,
        white_card_number: nullIfBlank(whiteCardNumber),
        white_card_issue_date: nullIfBlankWorkerDate(whiteCardIssueDate),
        white_card_photo_url: whiteCardUrl,
        silica_cert_number: nullIfBlank(silicaNumber),
        silica_cert_issue_date: nullIfBlankWorkerDate(silicaIssueDate),
        silica_cert_photo_url: silicaUrl,
        drivers_licence_number: nullIfBlank(driversLicenceNumber),
        drivers_licence_class: nullIfBlank(driversLicenceClass),
        drivers_licence_expiry: nullIfBlankWorkerDate(driversLicenceExpiry),
        drivers_licence_photo_url: driversLicenceUrl,
      });
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tickets.");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePersonalFinancial = async () => {
    setSaving(true);
    setError(null);

    try {
      const result = await updateWorkerPersonalAndFinancialDetails({
        workerId: worker.id,
        firstName,
        lastName,
        email,
        phone,
        addressLine1,
        addressLine2,
        suburb,
        postcode,
        emergencyContactName: emergencyName,
        emergencyContactPhone: emergencyPhone,
        bankName,
        accountName,
        bankBsb,
        bankAccountNumber,
        superFund,
        superMemberNumber,
        tfn,
      });
      if (result.error) {
        setError(result.error);
        return;
      }

      onSaved({
        ...worker,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        email: email.trim(),
        phone: nullIfBlank(phone),
        address_line_1: nullIfBlank(addressLine1),
        address_line_2: nullIfBlank(addressLine2),
        suburb: nullIfBlank(suburb),
        postcode: nullIfBlank(postcode),
        emergency_contact_name: nullIfBlank(emergencyName),
        emergency_contact_phone: nullIfBlank(emergencyPhone),
        bank_name: result.values?.bank_name ?? nullIfBlank(bankName),
        bank_account_name: result.values?.bank_account_name ?? nullIfBlank(accountName),
        bank_bsb: result.values?.bank_bsb ?? formatWorkerBsb(bankBsb),
        bank_account_number:
          result.values?.bank_account_number ?? nullIfBlank(bankAccountNumber),
        super_fund: result.values?.super_fund ?? nullIfBlank(superFund),
        super_member_number:
          result.values?.super_member_number ?? nullIfBlank(superMemberNumber),
        tfn: result.values?.tfn ?? nullIfBlank(tfn),
      });
      router.refresh();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save personal and financial details."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (tab === "tickets") {
      void handleSaveTickets();
      return;
    }
    void handleSavePersonalFinancial();
  };

  return (
    <div
      className={modalOverlayClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-details-title"
    >
      <div className={cn(modalShellClass, "max-w-lg")}>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className={cn(modalCloseIconButtonClass, "absolute right-3 top-3 z-20")}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className={cn(modalBodyClass, "pt-10")}>
          <h2 id="my-details-title" className="text-xl font-bold text-slate-900">
            My Details & Compliance
          </h2>
          <p className="mt-1 text-sm text-slate-500">{worker.full_name}</p>

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

          <div
            className="mt-4 flex gap-2"
            role="tablist"
            aria-label="Details and compliance"
          >
            <button
              type="button"
              role="tab"
              id="tab-trigger-tickets"
              aria-selected={tab === "tickets"}
              aria-controls="tab-tickets"
              value="tickets"
              onClick={() => {
                setError(null);
                setTab("tickets");
              }}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition",
                tab === "tickets"
                  ? "bg-orange-500 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-orange-300"
              )}
            >
              Tickets
            </button>
            <button
              type="button"
              role="tab"
              id="tab-trigger-personal-financial"
              aria-selected={tab === "personal-financial"}
              aria-controls="tab-personal-financial"
              value="personal-financial"
              onClick={() => {
                setError(null);
                setTab("personal-financial");
              }}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition",
                tab === "personal-financial"
                  ? "bg-orange-500 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-orange-300"
              )}
            >
              Personal & Financial
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <div
            id="tab-tickets"
            role="tabpanel"
            aria-labelledby="tab-trigger-tickets"
            hidden={tab !== "tickets"}
            className="mt-4 space-y-4"
          >
            {showWhiteCard ? (
              <div className={sectionClass}>
                <h3 className="text-sm font-semibold text-orange-600">White Card</h3>
                <Field label="Card Number" htmlFor="ticket-white-card-number">
                  <input
                    id="ticket-white-card-number"
                    className={inputClass}
                    value={whiteCardNumber}
                    onChange={(e) => setWhiteCardNumber(e.target.value)}
                  />
                </Field>
                <Field label="Issue Date" htmlFor="ticket-white-card-issue">
                  <input
                    id="ticket-white-card-issue"
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
            ) : null}

            <div className={sectionClass}>
              <h3 className="text-sm font-semibold text-orange-600">
                Silica Certificate
              </h3>
              <Field label="Certificate Number" htmlFor="ticket-silica-number">
                <input
                  id="ticket-silica-number"
                  className={inputClass}
                  value={silicaNumber}
                  onChange={(e) => setSilicaNumber(e.target.value)}
                />
              </Field>
              <Field label="Issue Date" htmlFor="ticket-silica-issue">
                <input
                  id="ticket-silica-issue"
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

            {showDriversLicence ? (
              <div className={sectionClass}>
                <h3 className="text-sm font-semibold text-orange-600">
                  Driver&apos;s Licence
                </h3>
                <Field label="Licence Number" htmlFor="ticket-licence-number">
                  <input
                    id="ticket-licence-number"
                    className={inputClass}
                    value={driversLicenceNumber}
                    onChange={(e) => setDriversLicenceNumber(e.target.value)}
                  />
                </Field>
                <Field label="Class" htmlFor="ticket-licence-class">
                  <input
                    id="ticket-licence-class"
                    className={inputClass}
                    placeholder="e.g. C, MR, HR"
                    value={driversLicenceClass}
                    onChange={(e) => setDriversLicenceClass(e.target.value)}
                  />
                </Field>
                <Field label="Expiry Date" htmlFor="ticket-licence-expiry">
                  <input
                    id="ticket-licence-expiry"
                    type="date"
                    className={inputClass}
                    value={driversLicenceExpiry}
                    onChange={(e) => setDriversLicenceExpiry(e.target.value)}
                  />
                </Field>
                <DocumentCapture
                  label="Driver's Licence Photo"
                  file={docs.drivers_licence}
                  onFileChange={(f) =>
                    setDocs((d) => ({ ...d, drivers_licence: f }))
                  }
                  existingUrl={worker.drivers_licence_photo_url}
                  uploadedUrl={docUrls.drivers_licence}
                  uploadPath={`${uploadPrefix}/drivers-licence`}
                  onUploaded={(url) =>
                    setDocUrls((d) => ({ ...d, drivers_licence: url }))
                  }
                />
              </div>
            ) : null}

            {showHighRisk ? (
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
            ) : null}
          </div>

          <div
            id="tab-personal-financial"
            role="tabpanel"
            aria-labelledby="tab-trigger-personal-financial"
            hidden={tab !== "personal-financial"}
            className="mt-4 space-y-4"
          >
            <div className={sectionClass}>
              <h3 className="text-sm font-semibold text-orange-600">Personal</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First Name" htmlFor="personal-first-name">
                  <input
                    id="personal-first-name"
                    className={inputClass}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </Field>
                <Field label="Last Name" htmlFor="personal-last-name">
                  <input
                    id="personal-last-name"
                    className={inputClass}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Email" htmlFor="personal-email">
                <input
                  id="personal-email"
                  type="email"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </Field>
              <Field label="Phone Number" htmlFor="personal-phone">
                <input
                  id="personal-phone"
                  type="tel"
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field label="Address Line 1" htmlFor="personal-address-1">
                <input
                  id="personal-address-1"
                  className={inputClass}
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  autoComplete="address-line1"
                />
              </Field>
              <Field label="Address Line 2 (Optional)" htmlFor="personal-address-2">
                <input
                  id="personal-address-2"
                  className={inputClass}
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  autoComplete="address-line2"
                />
              </Field>
              <Field label="Suburb / City" htmlFor="personal-suburb">
                <input
                  id="personal-suburb"
                  className={inputClass}
                  value={suburb}
                  onChange={(e) => setSuburb(e.target.value)}
                  autoComplete="address-level2"
                />
              </Field>
              <Field label="Postal / Zip Code" htmlFor="personal-postcode">
                <input
                  id="personal-postcode"
                  className={inputClass}
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  autoComplete="postal-code"
                />
              </Field>
            </div>

            {showEmergencyContact ? (
              <div className={sectionClass}>
                <h3 className="text-sm font-semibold text-orange-600">
                  Emergency Contact
                </h3>
                <Field label="Emergency Contact Name" htmlFor="personal-emergency-name">
                  <input
                    id="personal-emergency-name"
                    className={inputClass}
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                  />
                </Field>
                <Field
                  label="Emergency Contact Number"
                  htmlFor="personal-emergency-phone"
                >
                  <input
                    id="personal-emergency-phone"
                    type="tel"
                    className={inputClass}
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                  />
                </Field>
              </div>
            ) : null}

            <div className={sectionClass}>
              <h3 className="text-sm font-semibold text-orange-600">Financial</h3>
              {loadingFinancials ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                  Loading financial details…
                </div>
              ) : (
                <>
                  <Field label="Bank Name" htmlFor="financial-bank-name">
                    <input
                      id="financial-bank-name"
                      className={inputClass}
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Account Name" htmlFor="financial-account-name">
                    <input
                      id="financial-account-name"
                      className={inputClass}
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      autoComplete="off"
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="BSB" htmlFor="financial-bsb">
                      <input
                        id="financial-bsb"
                        className={inputClass}
                        value={bankBsb}
                        onChange={(e) => setBankBsb(e.target.value)}
                        onBlur={() => {
                          const formatted = formatWorkerBsb(bankBsb);
                          if (formatted) setBankBsb(formatted);
                        }}
                        inputMode="numeric"
                        placeholder="000-000"
                        autoComplete="off"
                      />
                    </Field>
                    <Field label="Account Number" htmlFor="financial-account-number">
                      <input
                        id="financial-account-number"
                        className={inputClass}
                        value={bankAccountNumber}
                        onChange={(e) => setBankAccountNumber(e.target.value)}
                        inputMode="numeric"
                        autoComplete="off"
                      />
                    </Field>
                  </div>
                  <Field label="Superannuation Fund" htmlFor="financial-super-fund">
                    <input
                      id="financial-super-fund"
                      className={inputClass}
                      value={superFund}
                      onChange={(e) => setSuperFund(e.target.value)}
                    />
                  </Field>
                  <Field label="Super Member Number" htmlFor="financial-super-member">
                    <input
                      id="financial-super-member"
                      className={inputClass}
                      value={superMemberNumber}
                      onChange={(e) => setSuperMemberNumber(e.target.value)}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Tax File Number (TFN)" htmlFor="financial-tfn">
                    <input
                      id="financial-tfn"
                      className={inputClass}
                      value={tfn}
                      onChange={(e) => setTfn(e.target.value)}
                      autoComplete="off"
                    />
                  </Field>
                </>
              )}
            </div>
          </div>
        </div>

        <ModalActionFooter>
          <div className="flex gap-3 pb-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (tab === "personal-financial" && loadingFinancials)}
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
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
        </ModalActionFooter>
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
              driversLicenceExpiry || worker.drivers_licence_expiry,
              next.map((v) => v.expiry_date)
            );
            onSaved({ ...worker });
          }}
        />
      ) : null}
    </div>
  );
}
