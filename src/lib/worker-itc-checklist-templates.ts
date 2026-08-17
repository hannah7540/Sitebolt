import { STANDARD_ITC_INSPECTION_ACTIVITIES } from "./itc-batch-templates";

export interface WorkerItcChecklistTemplateItem {
  item_key: string;
  item_label: string;
  is_mandatory: boolean;
  sort_order: number;
  description?: string;
}

export const WORKER_ITC_CHECKLIST_TEMPLATE: WorkerItcChecklistTemplateItem[] =
  STANDARD_ITC_INSPECTION_ACTIVITIES.map((activity) => ({
    item_key: `activity_${activity.activity_number}`,
    item_label: activity.title,
    is_mandatory: true,
    sort_order: activity.activity_number - 1,
    description: activity.inspection_criteria,
  }));

export function getChecklistTemplateItem(
  itemKey: string
): WorkerItcChecklistTemplateItem | undefined {
  return WORKER_ITC_CHECKLIST_TEMPLATE.find((item) => item.item_key === itemKey);
}
