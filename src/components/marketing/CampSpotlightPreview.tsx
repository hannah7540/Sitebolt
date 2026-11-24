const ZONE_ROWS = [
  {
    zone: "Zone A",
    cells: ["#3B82F6", "#10B981", "#F59E0B", "#3B82F6"],
  },
  {
    zone: "Zone B",
    cells: ["#10B981", "#3B82F6", "#10B981", "#F59E0B"],
  },
  {
    zone: "Zone C",
    cells: ["#3B82F6", "#F59E0B", "#10B981", "#3B82F6"],
  },
] as const;

const ROLE_PILLS = [
  "Manager",
  "Admin",
  "Gatehouse iPad",
  "Kitchen",
  "Cleaners",
  "Residents",
] as const;

export default function CampSpotlightPreview() {
  return (
    <div className="rounded-2xl border border-[rgba(148,163,184,0.16)] bg-[#1E293B]/60 p-5 shadow-sm backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#38BDF8]">
          Live status overview
        </p>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
          Sample data
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {ZONE_ROWS.map((row) => (
          <div key={row.zone} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs font-semibold text-[#CBD5E1]">{row.zone}</span>
            <div className="flex flex-1 gap-1.5">
              {row.cells.map((color, index) => (
                <span
                  key={`${row.zone}-${index}`}
                  className="h-7 flex-1 rounded-md"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-[rgba(148,163,184,0.16)] pt-4">
        {ROLE_PILLS.map((role) => (
          <span
            key={role}
            className="rounded-full border border-[rgba(148,163,184,0.24)] bg-[#0F172A]/70 px-2.5 py-1 text-[10px] font-semibold text-[#94A3B8]"
          >
            {role}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-[#94A3B8]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Vacant
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-blue-500" /> Occupied
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-amber-500" /> Needs clean
        </span>
      </div>
    </div>
  );
}
