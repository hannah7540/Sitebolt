"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import CompanyLogo from "@/components/ui/CompanyLogo";
import {
  ClipboardList,
  ChevronDown,
  ChevronRight,
  HardHat,
  Building2,
  Shield,
  FolderKanban,
  Truck,
  ReceiptText,
  CalendarSearch,
  Clock,
  FileSpreadsheet,
  Scale,
  UserPlus,
  Bot,
  LogOut,
  KeyRound,
  Mail,
  MessageSquareText,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import { useSiteBoltAI } from "@/components/ai/SiteBoltAIContext";
import {
  filterActiveProjects,
  type DbProject,
} from "@/lib/project-resolver";
import { useIncidentUnreadCount } from "@/hooks/useIncidentUnreadCount";
import { useSmsUnreadCount } from "@/hooks/useSmsUnreadCount";
import {
  extractProjectIdFromPathname,
  isProjectNavHrefActive,
  resolveProjectNavHref,
} from "@/lib/project-nav-routes";
import { DEFAULT_ADMIN_PROFILE_NAME, workerProfileDashboardPath } from "@/lib/user-session";
import { signOutAndRedirect } from "@/lib/auth-guard";
import { useAuthProfileDisplay } from "@/hooks/useAuthProfileDisplay";
import {
  canAccessAdminConsole,
  canAccessCommunicationsModule,
  canManageSecuritySettings,
  type SecurityRole,
  type AccountsAccessRole,
} from "@/lib/security-roles";
import {
  canAccessOrganisationRoute,
  canAccessOrganisationView,
  filterProjectsForRole,
  shouldShowAccountsNavItem,
} from "@/lib/rbac-guards";
import { ORGANISATION_NAV_ITEMS } from "@/lib/organisation-nav-routes";
import { parseConsoleRoute } from "@/lib/console-nav-routes";
import {
  isInductionsPath,
  isOrganisationNavActive,
  isSwmsPath,
} from "@/lib/organisation-nav-routes";
import { useComplianceAlertCount } from "@/hooks/useComplianceAlertCount";
import { useHiredLabourPendingCount } from "@/hooks/useHiredLabourPendingCount";
import { usePersistedSidebarSection } from "@/hooks/usePersistedSidebarSection";
import {
  SidebarCollapseProvider,
  SidebarCollapseToggle,
  SidebarSectionShell,
  useSidebarIconOnly,
} from "@/components/sidebar/SidebarCollapse";
import { cn } from "@/lib/utils";
import WorkerProfileAvatar from "@/components/ui/WorkerProfileAvatar";
import ThemePicker from "@/components/theme/ThemePicker";
import { useOrganisationWorkspace } from "@/components/organisation/OrganisationWorkspaceProvider";
import { SUPER_ADMIN_CONSOLE_ROLE } from "@/lib/super-admin";
import {
  ALL_ENABLED_FEATURE_FLAGS,
  isFeatureModuleEnabled,
  type OrganisationFeatureFlags,
} from "@/lib/organisation-feature-flags";

export type ActiveView =
  | "dashboard"
  | "workers"
  | "worker-scheduler"
  | "plant"
  | "assets"
  | "itps"
  | "swms"
  | "scheduler"
  | "forms"
  | "subcontractors"
  | "admin-master-dashboard"
  | "admin-itc"
  | "admin-plant-calendar"
  | "admin-worker-calendar"
  | "admin-swms"
  | "admin-document-pack"
  | "admin-reporting"
  | "my-profile"
  | "org-company"
  | "org-dashboard"
  | "org-insurances"
  | "org-documents"
  | "org-forms"
  | "org-projects"
  | "org-workers"
  | "org-bulk-onboarding"
  | "org-tags"
  | "org-suppliers"
  | "org-inductions"
  | "org-plant"
  | "org-assets"
  | "org-security"
  | "org-fleet"
  | "org-alerts";

export interface NavigateOptions {
  openAdd?: boolean;
  projectId?: string;
}

interface SidebarProps {
  activeView: ActiveView;
  projects: DbProject[];
  selectedProjectId?: string | null;
  sessionRole: SecurityRole;
  sessionSecurityRoleRaw?: string | null;
  assignedProjectIds?: readonly string[];
  accountsAccessRole?: AccountsAccessRole;
  canAccessAccounts?: boolean;
  permissionsLoading?: boolean;
  onNavigate: (view: ActiveView, options?: NavigateOptions) => void;
  profileName?: string;
  profileWorkerId?: string | null;
  onOpenProfile?: () => void;
}

interface SubItem {
  label: string;
  view?: ActiveView;
  href?: string;
  openAdd?: boolean;
  badge?: number;
}

interface NestedGroup {
  label: string;
  id?: string;
  items: (SubItem | NestedGroup)[];
}

interface SidebarMenuChild {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

interface SidebarMenuGroup {
  title: string;
  icon: LucideIcon;
  isCollapsible: boolean;
  defaultExpanded: boolean;
  children: SidebarMenuChild[];
}

function buildAccountsMenu(
  sessionRole: SecurityRole,
  accountsAccessRole: AccountsAccessRole = "disabled",
  canAccessAccounts = false,
  sessionSecurityRoleRaw: string | null = null
): SidebarMenuGroup | null {
  const children: SidebarMenuChild[] = [];
  const itemOptions = {
    accountsAccessRole,
    canAccessAccounts,
    sessionSecurityRoleRaw,
  };

  if (shouldShowAccountsNavItem(sessionRole, "/accounts/timesheets", itemOptions)) {
    children.push({
      title: "Timesheets",
      href: "/accounts/timesheets",
      icon: Clock,
    });
  }

  if (shouldShowAccountsNavItem(sessionRole, "/accounts/missing-timesheets", itemOptions)) {
    children.push({
      title: "Missing Timesheet Search",
      href: "/accounts/missing-timesheets",
      icon: CalendarSearch,
    });
  }

  if (shouldShowAccountsNavItem(sessionRole, "/accounts/pay-rules", itemOptions)) {
    children.push({
      title: "Pay Rules",
      href: "/accounts/pay-rules",
      icon: Scale,
    });
  }

  if (shouldShowAccountsNavItem(sessionRole, "/accounts/add-timesheets", itemOptions)) {
    children.push({
      title: "Add Timesheets",
      href: "/accounts/add-timesheets",
      icon: UserPlus,
    });
  }

  if (shouldShowAccountsNavItem(sessionRole, "/accounts/timesheet-reports", itemOptions)) {
    children.push({
      title: "Timesheet Reports",
      href: "/accounts/timesheet-reports",
      icon: FileSpreadsheet,
    });
  }

  if (children.length === 0) return null;

  return {
    title: "ACCOUNTS",
    icon: ReceiptText,
    isCollapsible: true,
    defaultExpanded: true,
    children,
  };
}

function isNestedGroup(item: SubItem | NestedGroup): item is NestedGroup {
  return "items" in item && Array.isArray(item.items);
}

function NavLink({
  label,
  depth = 0,
  active,
  icon: Icon,
  onClick,
  badge,
  badgeTone = "default",
}: {
  label: string;
  depth?: number;
  active?: boolean;
  icon?: LucideIcon;
  onClick?: () => void;
  badge?: number;
  badgeTone?: "default" | "red";
}) {
  const iconOnly = useSidebarIconOnly();

  return (
    <button
      type="button"
      onClick={onClick}
      title={iconOnly ? label : undefined}
      aria-label={iconOnly ? label : undefined}
      className={cn(
        "relative flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
        active
          ? "bg-orange-500 font-bold text-white shadow-sm"
          : "text-slate-700 hover:bg-orange-50 hover:text-orange-600",
        depth === 0 && "font-medium",
        !iconOnly && depth === 1 && "pl-6 text-slate-600",
        !iconOnly && depth === 2 && "pl-9 text-xs text-slate-500",
        iconOnly && "justify-center px-0"
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            active ? "text-white" : "text-slate-400"
          )}
        />
      ) : iconOnly ? (
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-bold",
            active ? "text-white" : "text-slate-500"
          )}
        >
          {label.slice(0, 1)}
        </span>
      ) : null}
      <span className={cn("flex-1 truncate", iconOnly && "sr-only")}>{label}</span>
      {badge && badge > 0 ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
            iconOnly ? "absolute right-1 top-1 h-2 w-2 p-0" : "ml-auto",
            active && badgeTone !== "red" ? "bg-white/25 text-white" : "bg-red-500 text-white"
          )}
        >
          {iconOnly ? <span className="sr-only">{badge}</span> : badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
}

function RouteNavLink({
  label,
  href,
  depth = 0,
  active,
  icon,
  badge,
  badgeTone,
}: {
  label: string;
  href: string;
  depth?: number;
  active?: boolean;
  icon?: LucideIcon;
  badge?: number;
  badgeTone?: "default" | "red";
}) {
  const router = useRouter();

  return (
    <NavLink
      label={label}
      depth={depth}
      active={active}
      icon={icon}
      badge={badge}
      badgeTone={badgeTone}
      onClick={() => router.push(href)}
    />
  );
}

function ProjectAccordion({
  project,
  open,
  onToggle,
  activeView,
  selectedProjectId,
  onNavigate,
}: {
  project: NestedGroup;
  open: boolean;
  onToggle: () => void;
  activeView: ActiveView;
  selectedProjectId?: string | null;
  onNavigate: SidebarProps["onNavigate"];
}) {
  const pathname = usePathname();
  const isSelectedProject =
    project.id === selectedProjectId ||
    Boolean(project.id && extractProjectIdFromPathname(pathname) === project.id);

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          open || isSelectedProject
            ? "bg-orange-50 text-orange-600"
            : "text-slate-700 hover:bg-orange-50 hover:text-orange-600"
        )}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        {project.label}
      </button>
      {open && (
        <div className="mt-1 ml-5 space-y-0.5 border-l border-slate-200 pl-2">
          {project.items.map((item) =>
            isNestedGroup(item) ? (
              <NestedAccordion
                key={item.label}
                group={item}
                activeView={activeView}
                projectId={project.id}
                selectedProjectId={selectedProjectId}
                onNavigate={onNavigate}
              />
            ) : (
              (() => {
                const href = resolveProjectNavHref(item, project.id);
                if (href) {
                  return (
                    <RouteNavLink
                      key={item.label}
                      label={item.label}
                      depth={1}
                      href={href}
                      active={isProjectNavHrefActive(pathname, href)}
                    />
                  );
                }
                return (
                  <NavLink
                    key={item.label}
                    label={item.label}
                    depth={1}
                    active={item.view === activeView && isSelectedProject}
                    onClick={
                      item.view
                        ? () =>
                            onNavigate(item.view!, {
                              openAdd: item.openAdd,
                              projectId: project.id,
                            })
                        : undefined
                    }
                  />
                );
              })()
            )
          )}
        </div>
      )}
    </div>
  );
}

function NestedAccordion({
  group,
  activeView,
  projectId,
  selectedProjectId,
  onNavigate,
}: {
  group: NestedGroup;
  activeView: ActiveView;
  projectId?: string;
  selectedProjectId?: string | null;
  onNavigate: SidebarProps["onNavigate"];
}) {
  const pathname = usePathname();
  const routeProjectId = extractProjectIdFromPathname(pathname);
  const resolvedProjectId = projectId ?? routeProjectId ?? undefined;
  const isSelectedProject =
    resolvedProjectId != null &&
    (resolvedProjectId === selectedProjectId || resolvedProjectId === routeProjectId);
  const hasActiveChild = group.items.some((sub) => {
    if (isNestedGroup(sub)) return false;
    const href = resolveProjectNavHref(sub, resolvedProjectId);
    if (href) return isProjectNavHrefActive(pathname, href);
    return sub.view === activeView && isSelectedProject;
  });
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
          hasActiveChild
            ? "font-medium text-orange-600"
            : "text-slate-600 hover:bg-orange-50 hover:text-orange-600"
        )}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        {group.label}
      </button>
      {open && (
        <div className="ml-4 space-y-0.5">
          {group.items.map((sub) => {
            if (isNestedGroup(sub)) return null;
            const href = resolveProjectNavHref(sub, resolvedProjectId);
            if (href) {
              return (
                <RouteNavLink
                  key={sub.label}
                  label={sub.label}
                  depth={2}
                  href={href}
                  active={isProjectNavHrefActive(pathname, href)}
                />
              );
            }
            return (
              <NavLink
                key={sub.label}
                label={sub.label}
                depth={2}
                active={sub.view === activeView && isSelectedProject}
                onClick={
                  sub.view
                    ? () =>
                        onNavigate(sub.view!, {
                          openAdd: sub.openAdd,
                          projectId: resolvedProjectId,
                        })
                    : undefined
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function buildStandardProjectNavItems(
  flags: OrganisationFeatureFlags
): (SubItem | NestedGroup)[] {
  const workerItems: SubItem[] = [{ label: "Assigned Workers", view: "workers" as const }];
  if (isFeatureModuleEnabled(flags, "calendars")) {
    workerItems.push({ label: "Worker Calendar", view: "worker-scheduler" as const });
  }

  const items: (SubItem | NestedGroup)[] = [
    { label: "Project Dashboard", view: "dashboard" as const },
    {
      label: "Workers",
      items: workerItems,
    },
  ];

  if (isFeatureModuleEnabled(flags, "plant")) {
    const plantItems: SubItem[] = [{ label: "Assigned Plant", view: "plant" as const }];
    if (isFeatureModuleEnabled(flags, "calendars")) {
      plantItems.push({ label: "Plant Calendar", view: "scheduler" as const });
    }
    items.push({ label: "Plant", items: plantItems });
    items.push({ label: "Assets", view: "assets" as const });
  }

  if (isFeatureModuleEnabled(flags, "swms")) {
    items.push({
      label: "SWMS",
      items: [
        { label: "Active SWMS", view: "swms" as const },
        { label: "Review SWMS", href: "swms/review" },
      ],
    });
  }

  items.push({ label: "Forms", view: "forms" as const });
  return items;
}

function buildProjectNav(
  projects: DbProject[],
  flags: OrganisationFeatureFlags
): NestedGroup[] {
  if (projects.length === 0) {
    return [
      {
        label: "No projects yet",
        items: [{ label: "Add projects in Organisation → Projects" }],
      },
    ];
  }

  const standardItems = buildStandardProjectNavItems(flags);

  return projects.map((project) => ({
    id: project.id,
    label: project.name,
    items: standardItems,
  }));
}

export default function Sidebar({
  activeView,
  projects,
  selectedProjectId,
  sessionRole,
  sessionSecurityRoleRaw = null,
  assignedProjectIds = [],
  accountsAccessRole = "disabled",
  canAccessAccounts = false,
  permissionsLoading: _permissionsLoading = false,
  onNavigate,
  profileName: profileNameOverride,
  profileWorkerId,
  onOpenProfile,
}: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { profileName: sessionProfileName, profilePhotoUrl, loading: profileLoading } =
    useAuthProfileDisplay();
  const profileName = profileNameOverride ?? sessionProfileName;
  const handleSignOut = () => {
    void signOutAndRedirect(undefined, router);
  };
  const handleProfileClick = () => {
    if (onOpenProfile) {
      onOpenProfile();
      return;
    }

    router.push(
      workerProfileDashboardPath(profileWorkerId, { fromAdmin: pathname !== "/" })
    );
  };
  const consoleRoute = useMemo(
    () => parseConsoleRoute(pathname, searchParams),
    [pathname, searchParams]
  );
  const effectiveSelectedProjectId =
    selectedProjectId ?? consoleRoute?.projectId ?? null;
  const effectiveActiveView = consoleRoute?.view ?? activeView;
  const profileActive =
    effectiveActiveView === "my-profile" ||
    pathname.startsWith("/worker-dashboard");
  const workspace = useOrganisationWorkspace();
  const isSuperAdmin = workspace?.isSuperAdmin === true;
  const featureFlags = workspace?.featureFlags ?? ALL_ENABLED_FEATURE_FLAGS;
  const orgId = workspace?.activeCompany?.id ?? null;
  const effectiveRole = isSuperAdmin ? SUPER_ADMIN_CONSOLE_ROLE : sessionRole;
  const showSecurity = isSuperAdmin || canManageSecuritySettings(effectiveRole);
  const showAdminNav = canAccessAdminConsole(effectiveRole);
  const showCommunication = canAccessCommunicationsModule(effectiveRole);
  const showOrganisation = canAccessOrganisationRoute(effectiveRole);
  const accountsMenu = isSuperAdmin
    ? buildAccountsMenu(
        SUPER_ADMIN_CONSOLE_ROLE,
        "full_access",
        true,
        SUPER_ADMIN_CONSOLE_ROLE
      )
    : buildAccountsMenu(
        sessionRole,
        accountsAccessRole,
        canAccessAccounts,
        sessionSecurityRoleRaw
      );

  const roleFilteredProjects = useMemo(
    () =>
      filterProjectsForRole(
        isSuperAdmin ? SUPER_ADMIN_CONSOLE_ROLE : sessionRole,
        projects,
        assignedProjectIds
      ),
    [isSuperAdmin, sessionRole, projects, assignedProjectIds]
  );
  const activeProjects = useMemo(
    () => filterActiveProjects(roleFilteredProjects),
    [roleFilteredProjects]
  );
  const projectItems = useMemo(
    () => buildProjectNav(activeProjects, featureFlags),
    [activeProjects, featureFlags]
  );
  const complianceAlertCount = useComplianceAlertCount();

  const organisationItems: SubItem[] = useMemo(
    () => {
      const items: SubItem[] = [
        { label: "Profile Dashboard", href: "/organisation/dashboard" },
        { label: "Company Information", href: "/organisation/company" },
      ];
      if (isFeatureModuleEnabled(featureFlags, "insurance", orgId)) {
        items.push({ label: "Insurances", href: "/organisation/insurances" });
      }
      items.push(
        { label: "Documents", href: "/organisation/documents" },
        { label: "Forms", href: "/organisation/forms" },
        { label: "Projects", href: "/organisation/projects" },
        { label: "Workers", href: "/organisation/workers" },
        { label: "Bulk Onboarding", href: "/organisation/onboarding/bulk" },
        { label: "Tags", href: "/organisation/tags" },
        { label: "Supplier Accounts", href: "/organisation/suppliers" },
        { label: "Inductions", href: "/admin/forms/inductions" }
      );
      if (isFeatureModuleEnabled(featureFlags, "swms", orgId)) {
        items.push({ label: "SWMS", href: "/admin/swms" });
      }
      if (isFeatureModuleEnabled(featureFlags, "plant", orgId)) {
        items.push({ label: "Plant", href: "/organisation/plant" });
        items.push({ label: "Fleet", href: "/organisation/fleet" });
      }
      if (isFeatureModuleEnabled(featureFlags, "insurance", orgId)) {
        items.push({
          label: "Alerts",
          href: "/organisation/alerts",
          badge: complianceAlertCount,
        });
      }
      if (isFeatureModuleEnabled(featureFlags, "plant", orgId)) {
        items.push({ label: "Assets", href: "/organisation/assets" });
      }
      if (showSecurity) {
        items.push({ label: "Security Settings", href: "/organisation/security" });
      }
      return items.filter((item) => {
        const view = ORGANISATION_NAV_ITEMS.find((nav) => nav.href === item.href)?.view;
        if (!view) return showOrganisation;
        return canAccessOrganisationView(effectiveRole, view);
      });
    },
    [complianceAlertCount, effectiveRole, featureFlags, orgId, showOrganisation, showSecurity]
  );

  return (
    <SidebarCollapseProvider>
    <SidebarFrame
      profileActive={profileActive}
      profileName={profileName}
      profilePhotoUrl={profilePhotoUrl}
      profileLoading={profileLoading}
      onProfileClick={handleProfileClick}
      onSignOut={handleSignOut}
    >

      <nav className="flex-1 overflow-y-auto py-2">
        {showAdminNav && isFeatureModuleEnabled(featureFlags, "projects", orgId) ? (
          <ProjectsSection
            projects={projectItems}
            activeView={effectiveActiveView}
            selectedProjectId={effectiveSelectedProjectId}
            onNavigate={onNavigate}
          />
        ) : null}

        {showAdminNav && isFeatureModuleEnabled(featureFlags, "administration", orgId) ? (
          <AdministrationSection
            activeView={effectiveActiveView}
            pathname={pathname}
            onNavigate={onNavigate}
            featureFlags={featureFlags}
            organisationId={orgId}
          />
        ) : null}

        {showAdminNav && isFeatureModuleEnabled(featureFlags, "subcontractors", orgId) ? (
          <SubcontractorsSection activeView={effectiveActiveView} onNavigate={onNavigate} />
        ) : null}

        {showAdminNav && isFeatureModuleEnabled(featureFlags, "accounts", orgId) && accountsMenu ? (
          <AccountsSection menu={accountsMenu} pathname={pathname} />
        ) : null}

        {showCommunication && isFeatureModuleEnabled(featureFlags, "communication", orgId) ? (
          <EmailsSection pathname={pathname} showEmails showSms />
        ) : null}

        {showOrganisation && isFeatureModuleEnabled(featureFlags, "organisation", orgId) ? (
          <OrganisationSection
            items={organisationItems}
            activeView={effectiveActiveView}
            pathname={pathname}
          />
        ) : null}
      </nav>

    </SidebarFrame>
    </SidebarCollapseProvider>
  );
}

function SidebarFrame({
  profileActive,
  profileName,
  profilePhotoUrl,
  profileLoading,
  onProfileClick,
  onSignOut,
  children,
}: {
  profileActive: boolean;
  profileName: string;
  profilePhotoUrl?: string | null;
  profileLoading: boolean;
  onProfileClick: () => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const iconOnly = useSidebarIconOnly();
  const { openModal: openSiteBoltAI } = useSiteBoltAI();

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-surface text-foreground transition-[width] duration-200 ease-in-out",
        iconOnly ? "w-72 lg:w-20" : "w-72 lg:w-80"
      )}
    >
      <div
        className={cn(
          "flex items-center border-b border-slate-200",
          iconOnly ? "justify-center px-1 py-2" : "justify-end px-2 py-1.5"
        )}
      >
        <SidebarCollapseToggle />
      </div>

      <button
        type="button"
        onClick={onProfileClick}
        title={iconOnly ? profileName : undefined}
        className={cn(
          "w-full border-b border-slate-200 text-left transition-colors",
          iconOnly ? "p-2" : "p-4",
          profileActive
            ? "bg-orange-500 shadow-sm hover:bg-orange-600"
            : "hover:bg-orange-50"
        )}
        aria-label="Open my worker profile"
        aria-current={profileActive ? "page" : undefined}
      >
        <div className={cn("flex items-center", iconOnly ? "justify-center" : "gap-3")}>
          <WorkerProfileAvatar
            photoUrl={profilePhotoUrl}
            displayName={profileLoading ? DEFAULT_ADMIN_PROFILE_NAME : profileName}
            size={iconOnly ? "sm" : "md"}
            enableLightbox={false}
            ringClassName={cn(
              "ring-2",
              profileActive ? "ring-white/40" : "ring-orange-200"
            )}
          />
          <div className={cn("min-w-0 flex-1", iconOnly && "sr-only")}>
            <p
              className={cn(
                "truncate text-sm font-semibold",
                profileActive ? "text-white" : "text-slate-900"
              )}
            >
              {profileLoading ? DEFAULT_ADMIN_PROFILE_NAME : profileName}
            </p>
            <span
              className={cn(
                "mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-widest",
                profileActive
                  ? "bg-white/20 text-white"
                  : "bg-orange-100 text-orange-600"
              )}
            >
              MY PROFILE
            </span>
          </div>
        </div>
      </button>

      <div
        className={cn(
          "flex items-center border-b border-slate-200",
          iconOnly ? "justify-center px-1 py-2" : "gap-2 px-4 py-3"
        )}
      >
        {iconOnly ? (
          <CompanyLogo size="sm" showFallback className="max-w-[40px]" />
        ) : (
          <CompanyLogo size="md" showFallback />
        )}
      </div>

      {children}

      <div className={cn("mt-auto border-t border-slate-200", iconOnly ? "p-2" : "p-4")}>
        <button
          type="button"
          onClick={openSiteBoltAI}
          title="Site-Bolt AI"
          className={cn(
            "mb-3 flex w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white shadow-sm transition hover:brightness-105",
            iconOnly ? "h-10 w-10 px-0" : "px-3 py-2.5"
          )}
          style={{ backgroundColor: "#F48120" }}
          aria-label="Open Site-Bolt AI"
        >
          <Bot className="h-4 w-4 shrink-0" />
          <span className={cn("truncate", iconOnly && "sr-only")}>Site-Bolt AI</span>
        </button>
        <div className={cn("mb-3 flex items-center gap-2", iconOnly && "flex-col")}>
          <ThemePicker />
          <div
            className={cn(
              "grid min-w-0 flex-1 gap-2",
              iconOnly ? "grid-cols-1" : "grid-cols-2"
            )}
          >
            <Link
              href="/account/update-password"
              title="Change Password"
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700",
                iconOnly ? "h-10 w-10 px-0" : "px-3 py-2.5"
              )}
            >
              <KeyRound className="h-4 w-4 shrink-0" />
              <span className={cn("truncate", iconOnly && "sr-only")}>Change Password</span>
            </Link>
            <button
              type="button"
              onClick={onSignOut}
              title="Sign Out"
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700",
                iconOnly ? "h-10 w-10 px-0" : "px-3 py-2.5"
              )}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className={cn("truncate", iconOnly && "sr-only")}>Sign Out</span>
            </button>
          </div>
        </div>
        <p className={cn("text-xs text-slate-400", iconOnly && "sr-only")}>
          Construction Safety Platform
        </p>
      </div>
    </aside>
  );
}

function ProjectsSection({
  projects,
  activeView,
  selectedProjectId,
  onNavigate,
}: {
  projects: NestedGroup[];
  activeView: ActiveView;
  selectedProjectId?: string | null;
  onNavigate: SidebarProps["onNavigate"];
}) {
  const [open, setOpen] = useState(false);
  const [expandedProjectKey, setExpandedProjectKey] = useState<string | null>(null);
  const iconOnly = useSidebarIconOnly();

  const items = (
    <div className="space-y-1 px-2">
      {projects.map((project) => {
        const projectKey = project.id ?? project.label;
        return (
          <ProjectAccordion
            key={projectKey}
            project={project}
            open={expandedProjectKey === projectKey}
            onToggle={() =>
              setExpandedProjectKey((current) =>
                current === projectKey ? null : projectKey
              )
            }
            activeView={activeView}
            selectedProjectId={selectedProjectId}
            onNavigate={onNavigate}
          />
        );
      })}
    </div>
  );

  return (
    <SidebarSectionShell
      id="projects"
      icon={FolderKanban}
      label={`Projects (${projects.length})`}
      header={
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold tracking-wider text-orange-600"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4" />
            PROJECTS ({projects.length})
          </span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      }
    >
      {(open || iconOnly) && items}
    </SidebarSectionShell>
  );
}

function SubcontractorsSection({
  activeView,
  onNavigate,
}: {
  activeView: ActiveView;
  onNavigate: SidebarProps["onNavigate"];
}) {
  const pathname = usePathname();
  const hiredLabourPendingCount = useHiredLabourPendingCount();
  const hiredLabourActive =
    pathname === "/dashboard/subcontractors/hired-labour" ||
    pathname?.startsWith("/dashboard/subcontractors/hired-labour/") === true;
  const [open, toggleOpen] = usePersistedSidebarSection(
    "subcontractors",
    activeView === "subcontractors" || hiredLabourActive
  );
  const iconOnly = useSidebarIconOnly();
  const items: SubItem[] = [
    { label: "View All Subcontractors", view: "subcontractors" },
    { label: "Add New Subcontractor", view: "subcontractors", openAdd: true },
  ];

  return (
    <SidebarSectionShell
      id="subcontractors"
      icon={Truck}
      label="Subcontractors"
      active={activeView === "subcontractors" || hiredLabourActive}
      header={
        <button
          type="button"
          onClick={toggleOpen}
          className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold tracking-wider text-orange-600"
        >
          <span className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            SUBCONTRACTORS
          </span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      }
    >
      {(open || iconOnly) && (
        <div className="space-y-1 px-2">
          {items.map((item) => (
            <NavLink
              key={item.label}
              label={item.label}
              active={item.view === activeView && !item.openAdd && !hiredLabourActive}
              onClick={
                item.view
                  ? () =>
                      onNavigate(item.view!, {
                        openAdd: item.openAdd,
                      })
                  : undefined
              }
            />
          ))}
          <RouteNavLink
            label="Hired Labour"
            href="/dashboard/subcontractors/hired-labour"
            active={hiredLabourActive}
            badge={hiredLabourPendingCount}
            badgeTone="red"
          />
        </div>
      )}
    </SidebarSectionShell>
  );
}

function AccountsSection({
  menu,
  pathname,
}: {
  menu: SidebarMenuGroup;
  pathname: string | null;
}) {
  const isAccountsRoute = pathname?.startsWith("/accounts") ?? false;
  const [open, toggleOpen] = usePersistedSidebarSection(
    "accounts",
    isAccountsRoute,
    menu.defaultExpanded
  );
  const SectionIcon = menu.icon;
  const iconOnly = useSidebarIconOnly();

  return (
    <SidebarSectionShell
      id="accounts"
      icon={SectionIcon}
      label={menu.title}
      active={isAccountsRoute}
      header={
        <button
          type="button"
          onClick={() => menu.isCollapsible && toggleOpen()}
          className={cn(
            "flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold tracking-wider",
            isAccountsRoute ? "text-orange-700" : "text-orange-600"
          )}
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <SectionIcon className="h-4 w-4" />
            {menu.title}
          </span>
          {menu.isCollapsible ? (
            open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : null}
        </button>
      }
    >
      {(open || iconOnly) && (
        <div className="space-y-1 px-2">
          {menu.children.map((item) => {
            const isActive =
              pathname === item.href || pathname?.startsWith(`${item.href}/`);

            return (
              <RouteNavLink
                key={item.href}
                label={item.title}
                href={item.href}
                icon={item.icon}
                active={isActive}
              />
            );
          })}
        </div>
      )}
    </SidebarSectionShell>
  );
}

function buildCommunicationMenu(options: {
  showEmails: boolean;
  showSms: boolean;
  smsUnreadCount?: number;
}): SidebarMenuGroup | null {
  const children: SidebarMenuGroup["children"] = [];
  if (options.showEmails) {
    children.push({
      title: "Emails",
      href: "/emails",
      icon: Mail,
    });
  }
  if (options.showSms) {
    children.push({
      title: "SMS",
      href: "/sms",
      icon: MessageSquareText,
      badge: options.smsUnreadCount ?? 0,
    });
  }
  if (children.length === 0) return null;

  return {
    title: "Communication",
    icon: MessagesSquare,
    isCollapsible: true,
    defaultExpanded: true,
    children,
  };
}

function CommunicationSection({
  menu,
  pathname,
}: {
  menu: SidebarMenuGroup;
  pathname: string | null;
}) {
  const isCommunicationRoute =
    (pathname?.startsWith("/emails") || pathname?.startsWith("/sms")) ?? false;
  const [open, toggleOpen] = usePersistedSidebarSection(
    "communication",
    isCommunicationRoute,
    menu.defaultExpanded
  );
  const SectionIcon = menu.icon;
  const iconOnly = useSidebarIconOnly();

  return (
    <SidebarSectionShell
      id="communication"
      icon={SectionIcon}
      label={menu.title}
      active={isCommunicationRoute}
      header={
        <button
          type="button"
          onClick={() => menu.isCollapsible && toggleOpen()}
          className={cn(
            "flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold tracking-wider",
            isCommunicationRoute ? "text-orange-700" : "text-orange-600"
          )}
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <SectionIcon className="h-4 w-4" />
            {menu.title}
          </span>
          {menu.isCollapsible ? (
            open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : null}
        </button>
      }
    >
      {(open || iconOnly) && (
        <div className="space-y-1 px-2">
          {menu.children.map((item) => {
            const isActive =
              pathname === item.href || pathname?.startsWith(`${item.href}/`);

            return (
              <RouteNavLink
                key={item.href}
                label={item.title}
                href={item.href}
                icon={item.icon}
                active={isActive}
                depth={1}
                badge={item.badge}
              />
            );
          })}
        </div>
      )}
    </SidebarSectionShell>
  );
}

function EmailsSection({
  pathname,
  showEmails,
  showSms,
}: {
  pathname: string | null;
  showEmails: boolean;
  showSms: boolean;
}) {
  const smsUnreadCount = useSmsUnreadCount(showSms);
  const menu = buildCommunicationMenu({
    showEmails,
    showSms,
    smsUnreadCount,
  });
  if (!menu) return null;
  return <CommunicationSection menu={menu} pathname={pathname} />;
}

function AdministrationSection({
  activeView,
  pathname,
  onNavigate,
  featureFlags,
  organisationId,
}: {
  activeView: ActiveView;
  pathname: string | null;
  onNavigate: SidebarProps["onNavigate"];
  featureFlags: OrganisationFeatureFlags;
  organisationId: string | null;
}) {
  const isAdminRoute =
    ((pathname?.startsWith("/admin") ?? false) &&
      !isInductionsPath(pathname) &&
      !isSwmsPath(pathname)) ||
    (activeView.startsWith("admin-") && activeView !== "admin-swms");
  const isFormsRoute =
    (pathname?.startsWith("/admin/forms") ?? false) && !isInductionsPath(pathname);
  const isMasterDashboard =
    pathname === "/admin" ||
    pathname === "/admin/dashboard" ||
    activeView === "admin-master-dashboard";
  const incidentUnreadCount = useIncidentUnreadCount(true);
  const [open, toggleOpen] = usePersistedSidebarSection("administration", isAdminRoute);
  const [formsOpen, toggleFormsOpen] = usePersistedSidebarSection(
    "administration-forms",
    isFormsRoute
  );
  const items: SubItem[] = [];
  if (
    isFeatureModuleEnabled(featureFlags, "plant", organisationId) &&
    isFeatureModuleEnabled(featureFlags, "calendars", organisationId)
  ) {
    items.push({ label: "Full Plant Calendar", view: "admin-plant-calendar" });
  }
  if (isFeatureModuleEnabled(featureFlags, "calendars", organisationId)) {
    items.push({ label: "Full Worker Calendar", view: "admin-worker-calendar" });
  }
  if (isFeatureModuleEnabled(featureFlags, "itp_itc", organisationId)) {
    items.push({ label: "ITP / ITC", view: "admin-itc" });
  }
  items.push(
    { label: "1-Click Document Pack", view: "admin-document-pack" },
    { label: "Reporting", view: "admin-reporting" }
  );
  const iconOnly = useSidebarIconOnly();

  return (
    <SidebarSectionShell
      id="administration"
      icon={Shield}
      label="Administration"
      active={isAdminRoute}
      header={
        <button
          type="button"
          onClick={toggleOpen}
          className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold tracking-wider text-orange-600"
        >
          <span className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            ADMINISTRATION
          </span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      }
    >
      {(open || iconOnly) && (
        <div className="space-y-1 px-2">
          <RouteNavLink
            label="Master Project Dashboard"
            href="/admin/dashboard"
            active={isMasterDashboard}
          />
          <div>
            <button
              type="button"
              onClick={toggleFormsOpen}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-orange-50 hover:text-orange-600"
            >
              <span className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-slate-400" />
                Forms & Registers
                {incidentUnreadCount > 0 ? (
                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                    {incidentUnreadCount > 99 ? "99+" : incidentUnreadCount}
                  </span>
                ) : null}
              </span>
              {formsOpen ? (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>
            {formsOpen || iconOnly ? (
              <div className="space-y-1 pb-1">
                <RouteNavLink
                  label="RFI"
                  href="/admin/forms/rfi"
                  depth={1}
                  active={
                    pathname === "/admin/forms/rfi" ||
                    pathname?.startsWith("/admin/forms/rfi/")
                  }
                />
                <RouteNavLink
                  label="Requests"
                  href="/admin/forms/requests"
                  depth={1}
                  active={
                    pathname === "/admin/forms/requests" ||
                    pathname?.startsWith("/admin/forms/requests/")
                  }
                />
                <RouteNavLink
                  label="Incidents"
                  href="/admin/forms/incidents"
                  depth={1}
                  badge={incidentUnreadCount}
                  active={
                    pathname === "/admin/forms/incidents" ||
                    pathname?.startsWith("/admin/forms/incidents/")
                  }
                />
                <RouteNavLink
                  label="Competencies"
                  href="/admin/forms/competencies"
                  depth={1}
                  active={
                    pathname === "/admin/forms/competencies" ||
                    pathname?.startsWith("/admin/forms/competencies/")
                  }
                />
              </div>
            ) : null}
          </div>
          {items.map((item) => (
            <NavLink
              key={item.label}
              label={item.label}
              active={item.view === activeView}
              onClick={item.view ? () => onNavigate(item.view!) : undefined}
            />
          ))}
        </div>
      )}
    </SidebarSectionShell>
  );
}

function OrganisationSection({
  items,
  activeView,
  pathname,
}: {
  items: SubItem[];
  activeView: ActiveView;
  pathname: string | null;
}) {
  const isOrganisationRoute =
    (pathname?.startsWith("/organisation") ?? false) ||
    isInductionsPath(pathname) ||
    isSwmsPath(pathname) ||
    activeView === "admin-swms";
  const [open, toggleOpen] = usePersistedSidebarSection(
    "organisation",
    isOrganisationRoute
  );
  const iconOnly = useSidebarIconOnly();

  return (
    <SidebarSectionShell
      id="organisation"
      icon={Building2}
      label="Organisation"
      active={isOrganisationRoute}
      header={
        <button
          type="button"
          onClick={toggleOpen}
          className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold tracking-wider text-orange-600"
        >
          <span className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            ORGANISATION
          </span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      }
    >
      {(open || iconOnly) && (
        <div className="relative z-30 space-y-1 px-2">
          {items.map((item) => (
            <RouteNavLink
              key={item.label}
              label={item.label}
              href={item.href ?? "/organisation/dashboard"}
              badge={item.badge}
              active={isOrganisationNavActive(pathname, item.href ?? "")}
            />
          ))}
        </div>
      )}
    </SidebarSectionShell>
  );
}
