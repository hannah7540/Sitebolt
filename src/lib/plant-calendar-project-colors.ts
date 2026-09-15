export interface PlantCalendarProjectTone {
  badgeClass: string;
  rowClass: string;
  indicatorClass: string;
}

const UNASSIGNED_TONE: PlantCalendarProjectTone = {
  badgeClass: "border border-slate-200 bg-slate-100 text-slate-700",
  rowClass: "",
  indicatorClass: "border-l-slate-300",
};

const NAMED_PROJECT_TONES: Array<{
  test: (normalized: string) => boolean;
  tone: PlantCalendarProjectTone;
}> = [
  {
    test: (normalized) => normalized.includes("marsden park"),
    tone: {
      badgeClass: "border border-blue-300 bg-blue-100 text-blue-800",
      rowClass: "bg-blue-50/45",
      indicatorClass: "border-l-blue-600",
    },
  },
  {
    test: (normalized) =>
      /\bec\s*6\b/.test(normalized) || normalized.replace(/\s+/g, "").includes("ec6"),
    tone: {
      badgeClass: "border border-amber-300 bg-amber-100 text-amber-800",
      rowClass: "bg-amber-50/45",
      indicatorClass: "border-l-amber-500",
    },
  },
  {
    test: (normalized) => /\bbarton\b/.test(normalized),
    tone: {
      badgeClass: "border border-orange-300 bg-orange-100 text-orange-800",
      rowClass: "bg-orange-50/45",
      indicatorClass: "border-l-orange-500",
    },
  },
];

const FALLBACK_PALETTE: PlantCalendarProjectTone[] = [
  {
    badgeClass: "border border-emerald-300 bg-emerald-100 text-emerald-800",
    rowClass: "bg-emerald-50/45",
    indicatorClass: "border-l-emerald-600",
  },
  {
    badgeClass: "border border-purple-300 bg-purple-100 text-purple-800",
    rowClass: "bg-purple-50/45",
    indicatorClass: "border-l-purple-600",
  },
  {
    badgeClass: "border border-teal-300 bg-teal-100 text-teal-800",
    rowClass: "bg-teal-50/45",
    indicatorClass: "border-l-teal-600",
  },
  {
    badgeClass: "border border-rose-300 bg-rose-100 text-rose-800",
    rowClass: "bg-rose-50/45",
    indicatorClass: "border-l-rose-600",
  },
  {
    badgeClass: "border border-indigo-300 bg-indigo-100 text-indigo-800",
    rowClass: "bg-indigo-50/45",
    indicatorClass: "border-l-indigo-600",
  },
  {
    badgeClass: "border border-cyan-300 bg-cyan-100 text-cyan-800",
    rowClass: "bg-cyan-50/45",
    indicatorClass: "border-l-cyan-600",
  },
];

function normalizeProjectLabel(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashProjectKey(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function resolvePlantCalendarProjectTone(input: {
  projectId?: string | null;
  projectName?: string | null;
}): PlantCalendarProjectTone {
  const projectName = String(input.projectName ?? "").trim();
  const projectId = String(input.projectId ?? "").trim();
  const normalizedName = normalizeProjectLabel(projectName);

  if (
    (!projectId && !normalizedName) ||
    normalizedName === "unassigned"
  ) {
    return UNASSIGNED_TONE;
  }

  if (normalizedName) {
    const named = NAMED_PROJECT_TONES.find((entry) => entry.test(normalizedName));
    if (named) return named.tone;
  }

  const hashKey = (projectId || normalizedName || projectName).toLowerCase();
  return FALLBACK_PALETTE[hashProjectKey(hashKey) % FALLBACK_PALETTE.length];
}
