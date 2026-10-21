import { Shield } from "lucide-react";
import { insuranceTone, type SubcontractorPortalRecord } from "@/lib/subcontractor-portal";
import { cardClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value || "—"}</p>
    </div>
  );
}

function InsuranceCard({
  title,
  expiry,
  value,
  documentUrl,
}: {
  title: string;
  expiry: string;
  value: string;
  documentUrl: string;
}) {
  const tone = insuranceTone(expiry);

  return (
    <article className={cn("rounded-xl border p-5", tone.cardClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", tone.badgeClass)}>
          {tone.label}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className={labelClass}>Expiry date</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">{expiry || "—"}</dd>
        </div>
        <div>
          <dt className={labelClass}>Policy value</dt>
          <dd className="mt-1 text-sm font-medium text-slate-900">{value || "—"}</dd>
        </div>
      </dl>
      {documentUrl ? (
        <a
          href={documentUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex text-sm font-semibold text-orange-600 hover:text-orange-700"
        >
          View certificate
        </a>
      ) : (
        <p className="mt-4 text-sm text-slate-500">No certificate uploaded.</p>
      )}
    </article>
  );
}

export default function SubcontractorOverview({
  record,
}: {
  record: SubcontractorPortalRecord;
}) {
  return (
    <div className="space-y-6">
      <section className={`${cardClass} space-y-4 p-6`}>
        <h2 className="text-lg font-bold text-slate-900">Organisation details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Detail label="Company name" value={record.company_name} />
          <Detail label="Contact" value={record.contact_name} />
          <Detail label="ABN" value={record.abn} />
          <Detail label="Email" value={record.contact_email} />
          <div className="sm:col-span-2">
            <Detail label="Address" value={record.address} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Insurance</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <InsuranceCard
            title="Public Liability (PL)"
            expiry={record.public_liability_expiry}
            value={record.public_liability_value}
            documentUrl={record.public_liability_document_url}
          />
          <InsuranceCard
            title="Professional Indemnity (PI)"
            expiry={record.professional_indemnity_expiry}
            value={record.professional_indemnity_value}
            documentUrl={record.professional_indemnity_document_url}
          />
        </div>
      </section>
    </div>
  );
}
