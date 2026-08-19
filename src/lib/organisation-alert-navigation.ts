import type { ComplianceAlertItem } from "./compliance-alerts-hub";

export const ORG_DEEP_LINK_PARAMS = {
  id: "id",
  action: "action",
  ticketId: "ticket_id",
  documentId: "document_id",
  documentType: "document_type",
  tab: "tab",
  focus: "focus",
} as const;

export type OrganisationDeepLinkAction = "edit" | "view";

export interface OrganisationDeepLinkTarget {
  id: string | null;
  action: OrganisationDeepLinkAction | null;
  ticketId: string | null;
  documentId: string | null;
  documentType: string | null;
  tab: string | null;
  focus: string | null;
}

export function readOrganisationDeepLink(
  searchParams: Pick<URLSearchParams, "get">
): OrganisationDeepLinkTarget {
  const actionRaw = searchParams.get(ORG_DEEP_LINK_PARAMS.action)?.trim().toLowerCase();

  return {
    id: searchParams.get(ORG_DEEP_LINK_PARAMS.id)?.trim() || null,
    action:
      actionRaw === "view" ? "view" : actionRaw === "edit" ? "edit" : null,
    ticketId: searchParams.get(ORG_DEEP_LINK_PARAMS.ticketId)?.trim() || null,
    documentId: searchParams.get(ORG_DEEP_LINK_PARAMS.documentId)?.trim() || null,
    documentType: searchParams.get(ORG_DEEP_LINK_PARAMS.documentType)?.trim() || null,
    tab: searchParams.get(ORG_DEEP_LINK_PARAMS.tab)?.trim() || null,
    focus: searchParams.get(ORG_DEEP_LINK_PARAMS.focus)?.trim() || null,
  };
}

function buildOrganisationPath(
  path: string,
  params: Record<string, string | null | undefined>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const trimmed = value?.trim();
    if (trimmed) search.set(key, trimmed);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function buildComplianceAlertNavigationHref(alert: ComplianceAlertItem): string {
  const action: OrganisationDeepLinkAction = "edit";

  switch (alert.category) {
    case "company_insurance":
      return buildOrganisationPath("/organisation/insurances", {
        [ORG_DEEP_LINK_PARAMS.id]: alert.sourceId,
        [ORG_DEEP_LINK_PARAMS.action]: action,
      });
    case "worker_ticket":
      return buildOrganisationPath("/organisation/workers", {
        [ORG_DEEP_LINK_PARAMS.id]: alert.sourceId,
        [ORG_DEEP_LINK_PARAMS.ticketId]: String(alert.metadata.entryId ?? ""),
        [ORG_DEEP_LINK_PARAMS.tab]: "cards",
        [ORG_DEEP_LINK_PARAMS.action]: action,
      });
    case "fleet_registration":
      return buildOrganisationPath("/organisation/fleet", {
        [ORG_DEEP_LINK_PARAMS.id]: alert.sourceId,
        [ORG_DEEP_LINK_PARAMS.documentType]: String(
          alert.metadata.documentType ?? "rego"
        ),
        [ORG_DEEP_LINK_PARAMS.action]: action,
      });
    case "plant_registration":
      return buildOrganisationPath("/organisation/plant", {
        [ORG_DEEP_LINK_PARAMS.id]: alert.sourceId,
        [ORG_DEEP_LINK_PARAMS.documentId]: String(alert.metadata.documentId ?? ""),
        [ORG_DEEP_LINK_PARAMS.tab]: "documentation",
        [ORG_DEEP_LINK_PARAMS.action]: action,
      });
    case "heavy_vehicle_check":
      return buildOrganisationPath("/organisation/plant", {
        [ORG_DEEP_LINK_PARAMS.id]: alert.sourceId,
        [ORG_DEEP_LINK_PARAMS.tab]: "basic",
        [ORG_DEEP_LINK_PARAMS.focus]: "heavyVehicle",
        [ORG_DEEP_LINK_PARAMS.action]: action,
      });
    default:
      return "/organisation/alerts";
  }
}

export function getComplianceAlertActionLabel(alert: ComplianceAlertItem): string {
  switch (alert.category) {
    case "company_insurance":
      return "Amend Policy";
    case "worker_ticket":
      return "Amend Ticket";
    default:
      return "View & Update";
  }
}

export function attachComplianceAlertNavigation(
  alerts: ComplianceAlertItem[]
): ComplianceAlertItem[] {
  return alerts.map((alert) => ({
    ...alert,
    metadata: {
      ...alert.metadata,
      navigationHref: buildComplianceAlertNavigationHref(alert),
      actionLabel: getComplianceAlertActionLabel(alert),
    },
  }));
}
