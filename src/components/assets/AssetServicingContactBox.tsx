"use client";

import { Mail, Phone } from "lucide-react";
import type { Asset } from "@/lib/assets";
import { sectionClass } from "@/lib/ui-classes";

interface AssetServicingContactBoxProps {
  asset: Asset;
}

export function hasAssetContactInfo(asset: Asset): boolean {
  return Boolean(
    asset.service_contact_company ||
      asset.service_contact_name ||
      asset.service_contact_phone ||
      asset.service_contact_email
  );
}

export default function AssetServicingContactBox({ asset }: AssetServicingContactBoxProps) {
  if (!hasAssetContactInfo(asset)) {
    return (
      <div className={`${sectionClass} text-sm text-slate-500`}>
        <p className="font-semibold text-slate-700">Servicing & Calibration Contact</p>
        <p className="mt-1">No contact details recorded for this asset.</p>
      </div>
    );
  }

  return (
    <div className={sectionClass}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
        Servicing & Calibration Contact
      </p>
      {asset.service_contact_company ? (
        <p className="mt-2 text-sm font-semibold text-slate-900">
          {asset.service_contact_company}
        </p>
      ) : null}
      {asset.service_contact_name ? (
        <p className="text-sm text-slate-700">{asset.service_contact_name}</p>
      ) : null}
      <div className="mt-2 flex flex-col gap-1 text-sm">
        {asset.service_contact_phone ? (
          <a
            href={`tel:${asset.service_contact_phone.replace(/\s/g, "")}`}
            className="inline-flex items-center gap-2 text-orange-600 hover:text-orange-700"
          >
            <Phone className="h-3.5 w-3.5 shrink-0" />
            {asset.service_contact_phone}
          </a>
        ) : null}
        {asset.service_contact_email ? (
          <a
            href={`mailto:${asset.service_contact_email}`}
            className="inline-flex items-center gap-2 text-orange-600 hover:text-orange-700"
          >
            <Mail className="h-3.5 w-3.5 shrink-0" />
            {asset.service_contact_email}
          </a>
        ) : null}
      </div>
    </div>
  );
}
