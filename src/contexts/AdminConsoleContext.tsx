"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Worker } from "@/lib/supabase";
import type { DbProject } from "@/lib/project-resolver";
import type { AccountsAccessRole, SecurityRole } from "@/lib/security-roles";

export interface AdminConsoleContextValue {
  workers: Worker[];
  projects: DbProject[];
  adminWorkerId: string | null;
  sessionReady: boolean;
  loading: boolean;
  accessDenied: string | null;
  sessionRole: SecurityRole;
  accountsAccessRole: AccountsAccessRole;
  canAccessAccounts: boolean;
  assignedProjectIds: readonly string[];
  accountsReadOnly: boolean;
  canManageAccounts: boolean;
}

const AdminConsoleContext = createContext<AdminConsoleContextValue | null>(null);

export function AdminConsoleProvider({
  value,
  children,
}: {
  value: AdminConsoleContextValue;
  children: ReactNode;
}) {
  return (
    <AdminConsoleContext.Provider value={value}>{children}</AdminConsoleContext.Provider>
  );
}

export function useAdminConsole(): AdminConsoleContextValue {
  const context = useContext(AdminConsoleContext);
  if (!context) {
    throw new Error("useAdminConsole must be used within AdminConsoleShell");
  }
  return context;
}

export function useAdminConsoleOptional(): AdminConsoleContextValue | null {
  return useContext(AdminConsoleContext);
}
