"use client";

import { useState } from "react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import type { AdminItcSignoff } from "@/components/itc/admin/itp-itc-admin-types";
import { inputClass } from "@/lib/ui-classes";

interface AdminItcSignoffTiersProps {
  subcontractor: AdminItcSignoff;
  contractor: AdminItcSignoff;
  client: AdminItcSignoff;
  onSubcontractorChange: (next: AdminItcSignoff) => void;
  onContractorChange: (next: AdminItcSignoff) => void;
  onClientChange: (next: AdminItcSignoff) => void;
}

function SignoffBlock({
  title,
  value,
  onChange,
  showCompany,
}: {
  title: string;
  value: AdminItcSignoff;
  onChange: (next: AdminItcSignoff) => void;
  showCompany: boolean;
}) {
  const [padKey, setPadKey] = useState(0);
  const [resign, setResign] = useState(!value.signature_url);

  const patch = (next: Partial<AdminItcSignoff>) => onChange({ ...value, ...next });

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h4 className="mb-3 text-sm font-semibold text-slate-900">{title}</h4>
      <div className="grid gap-3">
        {showCompany ? (
          <label>
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Company name
            </span>
            <input
              value={value.company ?? ""}
              onChange={(event) => patch({ company: event.target.value })}
              className={inputClass}
            />
          </label>
        ) : null}
        <label>
          <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
            Full name
          </span>
          <input
            value={value.full_name ?? ""}
            onChange={(event) => patch({ full_name: event.target.value })}
            className={inputClass}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
            Position
          </span>
          <input
            value={value.position ?? ""}
            onChange={(event) => patch({ position: event.target.value })}
            className={inputClass}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Date</span>
          <input
            type="datetime-local"
            value={value.signed_at?.slice(0, 16) ?? ""}
            onChange={(event) => patch({ signed_at: event.target.value || null })}
            className={inputClass}
          />
        </label>
        {value.signature_url && !resign ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.signature_url}
              alt={`${title} signature`}
              className="h-24 w-full rounded-lg border border-slate-200 bg-white object-contain"
            />
            <button
              type="button"
              onClick={() => {
                patch({ signature_url: null, signed_at: null });
                setResign(true);
                setPadKey((current) => current + 1);
              }}
              className="text-sm font-semibold text-orange-600"
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <SignatureCanvas
              key={`${title}-${padKey}`}
              value={null}
              onChange={(dataUrl) => {
                patch({
                  signature_url: dataUrl,
                  signed_at: dataUrl ? value.signed_at || new Date().toISOString() : null,
                });
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (!value.signature_url) return;
                patch({
                  signed_at: value.signed_at || new Date().toISOString(),
                });
                setResign(false);
              }}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminItcSignoffTiers({
  subcontractor,
  contractor,
  client,
  onSubcontractorChange,
  onContractorChange,
  onClientChange,
}: AdminItcSignoffTiersProps) {
  return (
    <section className="mt-6 space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Contract sign-off</h3>
      <p className="text-xs text-slate-500">
        Sign directly on a touchscreen or iPad. Clear resets the pad; Save locks the current stroke
        and date onto the certificate.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        <SignoffBlock
          title="Verified by Subcontractor (A Plus Plumbing)"
          value={subcontractor}
          onChange={onSubcontractorChange}
          showCompany={false}
        />
        <SignoffBlock
          title="Reviewed by Managing Contractor (Built / Hindmarsh / RCC)"
          value={contractor}
          onChange={onContractorChange}
          showCompany
        />
        <SignoffBlock
          title="Reviewed by Client (CDC / Consultant — if required)"
          value={client}
          onChange={onClientChange}
          showCompany
        />
      </div>
    </section>
  );
}
