export type EmailTemplateCategory =
  | "General"
  | "Safety"
  | "Timesheets"
  | "Operations";

export const EMAIL_TEMPLATE_CATEGORIES: EmailTemplateCategory[] = [
  "General",
  "Safety",
  "Timesheets",
  "Operations",
];

export const EMAIL_TEMPLATE_PLACEHOLDERS = [
  { key: "worker_name", label: "Worker name", token: "{{worker_name}}" },
  { key: "project_name", label: "Project name", token: "{{project_name}}" },
  { key: "current_date", label: "Current date", token: "{{current_date}}" },
] as const;

export function applyTemplatePlaceholders(
  text: string,
  values: Record<string, string>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

export function buildDefaultPlaceholderValues(input?: {
  workerName?: string | null;
  projectName?: string | null;
}): Record<string, string> {
  return {
    worker_name: input?.workerName?.trim() || "Team Member",
    project_name: input?.projectName?.trim() || "your project",
    current_date: new Date().toLocaleDateString("en-AU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  };
}

export function categoryBadgeClass(category: string): string {
  switch (category) {
    case "Safety":
      return "bg-red-100 text-red-800";
    case "Timesheets":
      return "bg-violet-100 text-violet-800";
    case "Operations":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}
