import { formatExternalCompanyName, isExternalSwms } from "@/lib/swms-external";

export default function ExternalSwmsBadge({
  isExternal,
  companyName,
}: {
  isExternal?: boolean | null;
  companyName?: string | null;
}) {
  if (!isExternalSwms({ is_external: isExternal })) return null;
  const builder = formatExternalCompanyName(companyName);

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-800">
        External
      </span>
      {builder ? (
        <span className="text-xs font-medium text-slate-500">{builder}</span>
      ) : null}
    </span>
  );
}
