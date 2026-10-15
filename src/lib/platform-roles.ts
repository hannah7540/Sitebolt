import {
  ACCOUNTS_ACCESS_ROLES,
  SECURITY_ROLES,
  canAccessPayRules,
  canManageAccountsTimesheets,
  canViewAccountsTimesheets,
  type AccountsAccessRole,
  type SecurityRole,
} from "./security-roles";

export const PLATFORM_ROLES = ["owner", "super_admin"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PROFILE_ROLES = [...PLATFORM_ROLES, ...SECURITY_ROLES] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

export interface RolePermissionMatrix {
  unrestrictedRead: boolean;
  unrestrictedWrite: boolean;
  manageSecurity: boolean;
  viewFinancials: boolean;
  accessAdminConsole: boolean;
  accessAccounts: boolean;
  manageAccounts: boolean;
}

/** Client-side mirror of `role_permissions` seed data. */
export const ROLE_PERMISSIONS: Record<ProfileRole, RolePermissionMatrix> = {
  owner: {
    unrestrictedRead: true,
    unrestrictedWrite: true,
    manageSecurity: true,
    viewFinancials: true,
    accessAdminConsole: true,
    accessAccounts: true,
    manageAccounts: true,
  },
  super_admin: {
    unrestrictedRead: true,
    unrestrictedWrite: true,
    manageSecurity: true,
    viewFinancials: true,
    accessAdminConsole: true,
    accessAccounts: true,
    manageAccounts: true,
  },
  master_admin: {
    unrestrictedRead: true,
    unrestrictedWrite: true,
    manageSecurity: true,
    viewFinancials: true,
    accessAdminConsole: true,
    accessAccounts: true,
    manageAccounts: true,
  },
  full_access: {
    unrestrictedRead: false,
    unrestrictedWrite: false,
    manageSecurity: true,
    viewFinancials: true,
    accessAdminConsole: true,
    accessAccounts: true,
    manageAccounts: true,
  },
  project_team: {
    unrestrictedRead: false,
    unrestrictedWrite: false,
    manageSecurity: true,
    viewFinancials: false,
    accessAdminConsole: true,
    accessAccounts: true,
    manageAccounts: false,
  },
  general_worker: {
    unrestrictedRead: false,
    unrestrictedWrite: false,
    manageSecurity: false,
    viewFinancials: false,
    accessAdminConsole: false,
    accessAccounts: false,
    manageAccounts: false,
  },
};

export function normalizeProfileRole(
  role: string | null | undefined
): ProfileRole {
  const normalized = String(role ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "admin_access" || normalized === "admin" || normalized === "project_super_admin" || normalized === "project_admin") {
    return "project_team";
  }

  if ((PROFILE_ROLES as readonly string[]).includes(normalized)) {
    return normalized as ProfileRole;
  }

  return "general_worker";
}

export function hasUnrestrictedPlatformAccess(
  role: string | null | undefined
): boolean {
  const matrix = ROLE_PERMISSIONS[normalizeProfileRole(role)];
  return matrix.unrestrictedRead && matrix.unrestrictedWrite;
}

export function isPlatformOwnerRole(role: string | null | undefined): boolean {
  const normalized = normalizeProfileRole(role);
  return normalized === "owner" || normalized === "master_admin";
}

export function profileRoleToSecurityRole(role: ProfileRole): SecurityRole {
  if (role === "owner" || role === "super_admin") return "master_admin";
  return role;
}

export function profileRoleToAccountsAccessRole(
  role: ProfileRole
): AccountsAccessRole {
  const permissions = ROLE_PERMISSIONS[role];
  if (permissions.manageAccounts) return "full_access";
  if (permissions.accessAccounts) return "view_only";
  return "disabled";
}

export function extractRoleFromAuthMetadata(metadata: Record<string, unknown> | undefined): ProfileRole {
  const raw = metadata?.role ?? metadata?.security_role ?? metadata?.profile_role;
  return normalizeProfileRole(typeof raw === "string" ? raw : null);
}

export function securityRoleAllowsAccountsManage(role: SecurityRole): boolean {
  return canManageAccountsTimesheets(role);
}

export function securityRoleAllowsPayRules(role: SecurityRole): boolean {
  return canAccessPayRules(role);
}

export function securityRoleAllowsTimesheetsView(role: SecurityRole): boolean {
  return canViewAccountsTimesheets(role);
}

export { ACCOUNTS_ACCESS_ROLES };
