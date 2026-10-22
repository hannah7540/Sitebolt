export const RESOURCE_APPROVAL_PENDING = "pending";
export const RESOURCE_APPROVAL_APPROVED = "approved";

export type ResourceApprovalKind = "worker" | "plant";

export type PendingResourceApproval = {
  id: string;
  kind: ResourceApprovalKind;
  resourceId: string;
  resourceName: string;
  projectId: string;
  projectName: string;
  subcontractorId: string | null;
  approvalStatus: string;
};

export function isApprovedOrLegacyStatus(
  status: string | null | undefined
): boolean {
  const value = String(status ?? "").trim().toLowerCase();
  return !value || value === RESOURCE_APPROVAL_APPROVED;
}

export function isPendingApprovalStatus(
  status: string | null | undefined
): boolean {
  return String(status ?? "").trim().toLowerCase() === RESOURCE_APPROVAL_PENDING;
}

export function textValue(value: unknown): string {
  return value == null ? "" : String(value).trim();
}
