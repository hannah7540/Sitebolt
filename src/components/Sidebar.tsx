"use client";

import { useMemo, useState } from "react";
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
  Scale,
  UserPlus,
  LogOut,
  KeyRound,
  Mail,
  MessageSquareText,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import {
  filterActiveProjects,
  type DbProject,
} from "@/lib/project-resolver";
import { useIncidentUnreadCount } from "@/hooks/useIncidentUnreadCount";
import { useSmsUnreadCount } from "@/hooks/useSmsUnreadCount";
import {
  extractProjectIdFromPathname,
  resolveProjectNavHref,
} from "@/lib/project-nav-routes";
import { DEFAULT_ADMIN_PROFILE_NAME, workerProfileDashboardPath } from "@/lib/user-session";
import { signOutAndRedirect } from "@/lib/auth-guard";
import { useAuthProfileDisplay } from "@/hooks/useAuthProfileDisplay";
import {
  canAccessAccountsArea,
  canAccessEmailsModule,
  canAccessSmsModule,
  canAccessPayRules,
  canManageAdministration,
  canManageOrganisation,
  canManageSecuritySettings,
  canViewAccountsTimesheets,
  canAddAccountsTimesheets,
  type SecurityRole,
  type AccountsAccessRole,
} from "@/lib/security-roles";
import { filterProjectsForRole } from "@/lib/rbac-guards";
import { parseConsoleRoute } from "@/lib/console-nav-routes";
import { resolveOrganisationActiveView, isOrganisationNavActive } from "@/lib/organisation-nav-routes";
import { useComplianceAlertCount } from "@/hooks/useComplianceAlertCount";
import { cn } from "@/lib/utils";
import WorkerProfileAvatar from "@/components/ui/WorkerProfileAvatar";

export type ActiveView =
  | "dashboard"
  | "workers"
  | "worker-scheduler"
  | "plant"
  | "assets"
  | "itps"
  | "swms"
  | "scheduler"
  | "subcontractors"
  | "admin-master-dashboard"
  | "admin-plant-calendar"
  | "admin-worker-calendar"
  | "admin-swms"
  | "admin-document-pack"
  | "admin-reporting"
  | "my-profile"
  | "org-company"
  | "org-dashboard"
  | "org-insurances"
  | "org-projects"
  | "org-workers"
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

  if (canViewAccountsTimesheets(sessionRole)) {
    children.push({
      title: "Timesheets",
      href: "/accounts/timesheets",
      icon: Clock,
    });
  }

  if (
    canViewAccountsTimesheets(sessionRole) ||
    canAccessAccountsArea({
      securityRole: sessionRole,
      accountsAccessRole,
      canAccessAccounts,
    })
  ) {
    children.push({
      title: "Missing Timesheet Search",
      href: "/accounts/missing-timesheets",
      icon: CalendarSearch,
    });
  }

  if (canAccessPayRules(sessionRole)) {
    children.push({
      title: "Pay Rules",
      href: "/accounts/pay-rules",
      icon: Scale,
    });
  }

  if (
    canAddAccountsTimesheets(
      sessionSecurityRoleRaw ?? sessionRole,
      accountsAccessRole,
      canAccessAccounts
    )
  ) {
    children.push({
      title: "Add Timesheets",
      href: "/accounts/add-timesheets",
      icon: UserPlus,
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
}: {
  label: string;
  depth?: number;
  active?: boolean;
  icon?: LucideIcon;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
        active
          ? "bg-orange-500 font-bold text-white shadow-sm"
          : "text-slate-700 hover:bg-orange-50 hover:text-orange-600",
        depth === 0 && "font-medium",
        depth === 1 && "pl-6 text-slate-600",
        depth === 2 && "pl-9 text-xs text-slate-500"
      )}
    >
      {Icon ? (
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            active ? "text-white" : "text-slate-400"
          )}
        />
      ) : null}
      <span className="truncate flex-1">{label}</span>
      {badge && badge > 0 ? (
        <span
          className={cn(
            "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
            active ? "bg-white/25 text-white" : "bg-red-500 text-white"
          )}
        >
          {badge > 99 ? "99+" : badge}
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
}: {
  label: string;
  href: string;
  depth?: number;
  active?: boolean;
  icon?: LucideIcon;
  badge?: number;
}) {
  const router = useRouter();

  return (
    <NavLink
      label={label}
      depth={depth}
      active={active}
      icon={icon}
      badge={badge}
      onClick={() => router.push(href)}
    />
  );
}

function ProjectAccordion({
  project,
  defaultExpanded = false,
  activeView,
  selectedProjectId,
  onNavigate,
}: {
  project: NestedGroup;
  defaultExpanded?: boolean;
  activeView: ActiveView;
  selectedProjectId?: string | null;
  onNavigate: SidebarProps["onNavigate"];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(defaultExpanded);
  const isSelectedProject = project.id === selectedProjectId;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
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
                      active={
                        pathname === href || Boolean(pathname?.startsWith(`${href}/`))
                      }
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
  const hasActiveChild = group.items.some(
    (sub) =>
      !isNestedGroup(sub) && sub.view === activeView && isSelectedProject
  );
  const [open, setOpen] = useState(hasActiveChild);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
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
                  active={pathname === href || Boolean(pathname?.startsWith(`${href}/`))}
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

function buildStandardProjectNavItems(): (SubItem | NestedGroup)[] {
  return [
    { label: "Project Dashboard", view: "dashboard" as const },
    {
      label: "Workers",
      items: [
        { label: "Assigned Workers", view: "workers" as const },
        { label: "Worker Calendar", view: "worker-scheduler" as const },
      ],
    },
    {
      label: "Plant",
      items: [
        { label: "Assigned Plant", view: "plant" as const },
        { label: "Plant Calendar", view: "scheduler" as const },
      ],
    },
    { label: "Assets", view: "assets" as const },
    { label: "ITPs & ITCs", view: "itps" as const },
    { label: "SWMS", view: "swms" as const },
  ];
}

function buildProjectNav(projects: DbProject[]): NestedGroup[] {
  if (projects.length === 0) {
    return [
      {
        label: "No projects yet",
        items: [{ label: "Add projects in Organisation → Projects" }],
      },
    ];
  }

  const standardItems = buildStandardProjectNavItems();

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
  permissionsLoading = false,
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
    void signOutAndRedirect();
  };
  const handleProfileClick = () => {
    if (onOpenProfile && pathname === "/") {
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
  const showOrganisation = canManageOrganisation(sessionRole);
  const showAdministration = canManageAdministration(sessionRole);
  const showEmails = canAccessEmailsModule(sessionRole);
  const showSms = canAccessSmsModule(sessionRole);
  const showCommunication = showEmails || showSms;
  const showSecurity = canManageSecuritySettings(sessionRole);
  const accountsMenu = useMemo(
    () =>
      buildAccountsMenu(
        sessionRole,
        accountsAccessRole,
        canAccessAccounts,
        sessionSecurityRoleRaw
      ),
    [sessionRole, sessionSecurityRoleRaw, accountsAccessRole, canAccessAccounts]
  );
  const showAccounts =
    permissionsLoading ||
    (accountsMenu !== null &&
      canAccessAccountsArea({
        securityRole: sessionRole,
        accountsAccessRole,
        canAccessAccounts,
      }));

  const roleFilteredProjects = useMemo(
    () => filterProjectsForRole(sessionRole, projects, assignedProjectIds),
    [sessionRole, projects, assignedProjectIds]
  );
  const activeProjects = useMemo(
    () => filterActiveProjects(roleFilteredProjects),
    [roleFilteredProjects]
  );
  const projectItems = useMemo(
    () => buildProjectNav(activeProjects),
    [activeProjects]
  );
  const complianceAlertCount = useComplianceAlertCount();

  const organisationItems: SubItem[] = useMemo(
    () => [
      { label: "Profile Dashboard", href: "/organisation/dashboard" },
      { label: "Company Information", href: "/organisation/company" },
      { label: "Insurances", href: "/organisation/insurances" },
      { label: "Projects", href: "/organisation/projects" },
      { label: "Workers", href: "/organisation/workers" },
      { label: "Plant", href: "/organisation/plant" },
      { label: "Fleet", href: "/organisation/fleet" },
      { label: "Alerts", href: "/organisation/alerts", badge: complianceAlertCount },
      { label: "Assets", href: "/organisation/assets" },
      ...(showSecurity
        ? [{ label: "Security Settings", href: "/organisation/security" }]
        : []),
    ],
    [complianceAlertCount, showSecurity]
  );

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-white lg:w-80">
      <button
        type="button"
        onClick={handleProfileClick}
        className={cn(
          "w-full border-b border-slate-200 p-4 text-left transition-colors",
          profileActive
            ? "bg-orange-500 shadow-sm hover:bg-orange-600"
            : "hover:bg-orange-50"
        )}
        aria-label="Open my worker profile"
        aria-current={profileActive ? "page" : undefined}
      >
        <div className="flex items-center gap-3">
          <WorkerProfileAvatar
            photoUrl={profilePhotoUrl}
            displayName={profileLoading ? DEFAULT_ADMIN_PROFILE_NAME : profileName}
            size="md"
            enableLightbox={false}
            ringClassName={cn(
              "ring-2",
              profileActive ? "ring-white/40" : "ring-orange-200"
            )}
          />
          <div className="min-w-0 flex-1">
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

      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
        <CompanyLogo size="md" showFallback />
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <ProjectsSection
          projects={projectItems}
          activeView={effectiveActiveView}
          selectedProjectId={effectiveSelectedProjectId}
          onNavigate={onNavigate}
        />

        {showAdministration && (
          <AdministrationSection
            activeView={effectiveActiveView}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        )}

        <SubcontractorsSection activeView={effectiveActiveView} onNavigate={onNavigate} />

        {showAccounts && accountsMenu ? (
          <AccountsSection menu={accountsMenu} pathname={pathname} />
        ) : null}

        {showCommunication ? (
          <EmailsSection
            pathname={pathname}
            showEmails={showEmails}
            showSms={showSms}
          />
        ) : null}

        {showOrganisation && (
          <OrganisationSection
            items={organisationItems}
            activeView={effectiveActiveView}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        )}
      </nav>

      <div className="mt-auto border-t border-slate-200 p-4">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Link
            href="/account/update-password"
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
          >
            <KeyRound className="h-4 w-4 shrink-0" />
            <span className="truncate">Change Password</span>
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="truncate">Sign Out</span>
          </button>
        </div>
        <p className="text-xs text-slate-400">Construction Safety Platform</p>
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

  return (
    <div className="border-b border-slate-200 pb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold tracking-wider text-orange-600"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4" />
          PROJECTS ({projects.length})
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="space-y-1 px-2">
          {projects.map((project) => (
            <ProjectAccordion
              key={project.id ?? project.label}
              project={project}
              defaultExpanded={project.id === selectedProjectId}
              activeView={activeView}
              selectedProjectId={selectedProjectId}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubcontractorsSection({
  activeView,
  onNavigate,
}: {
  activeView: ActiveView;
  onNavigate: SidebarProps["onNavigate"];
}) {
  const [open, setOpen] = useState(false);
  const items: SubItem[] = [
    { label: "View All Subcontractors", view: "subcontractors" },
    { label: "Add New Subcontractor", view: "subcontractors", openAdd: true },
  ];

  return (
    <div className="border-b border-slate-200 pb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold tracking-wider text-orange-600"
      >
        <span className="flex items-center gap-2">
          <Truck className="h-4 w-4" />
          SUBCONTRACTORS
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="space-y-1 px-2">
          {items.map((item) => (
            <NavLink
              key={item.label}
              label={item.label}
              active={item.view === activeView && !item.openAdd}
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
        </div>
      )}
    </div>
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
  const [open, setOpen] = useState(menu.defaultExpanded || isAccountsRoute);
  const SectionIcon = menu.icon;

  return (
    <div className="border-b border-slate-200 pb-3">
      <button
        type="button"
        onClick={() => menu.isCollapsible && setOpen(!open)}
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
      {open && (
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
    </div>
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
  const [open, setOpen] = useState(menu.defaultExpanded || isCommunicationRoute);
  const SectionIcon = menu.icon;

  return (
    <div className="border-b border-slate-200 pb-3">
      <button
        type="button"
        onClick={() => menu.isCollapsible && setOpen(!open)}
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
      {open && (
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
    </div>
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
}: {
  activeView: ActiveView;
  pathname: string | null;
  onNavigate: SidebarProps["onNavigate"];
}) {
  const isFormsRoute = pathname?.startsWith("/admin/forms") ?? false;
  const isMasterDashboard =
    pathname === "/admin" ||
    pathname === "/admin/dashboard" ||
    activeView === "admin-master-dashboard";
  const incidentUnreadCount = useIncidentUnreadCount(true);
  const [open, setOpen] = useState(isFormsRoute || isMasterDashboard);
  const [formsOpen, setFormsOpen] = useState(isFormsRoute);
  const items: SubItem[] = [
    { label: "Full Plant Calendar", view: "admin-plant-calendar" },
    { label: "Full Worker Calendar", view: "admin-worker-calendar" },
    { label: "SWMS", view: "admin-swms" },
    { label: "1-Click Document Pack", view: "admin-document-pack" },
    { label: "Reporting", view: "admin-reporting" },
  ];

  return (
    <div className="border-b border-slate-200 pb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold tracking-wider text-orange-600"
      >
        <span className="flex items-center gap-2">
          <Shield className="h-4 w-4" />
          ADMINISTRATION
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="space-y-1 px-2">
          <RouteNavLink
            label="Master Project Dashboard"
            href="/admin/dashboard"
            active={isMasterDashboard}
          />
          <div>
            <button
              type="button"
              onClick={() => setFormsOpen(!formsOpen)}
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
            {formsOpen ? (
              <div className="space-y-1 pb-1">
                <RouteNavLink
                  label="Inductions"
                  href="/admin/forms/inductions"
                  depth={1}
                  active={
                    pathname === "/admin/forms/inductions" ||
                    pathname?.startsWith("/admin/forms/inductions/")
                  }
                />
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
    </div>
  );
}

function OrganisationSection({
  items,
  activeView,
  pathname,
  onNavigate,
}: {
  items: SubItem[];
  activeView: ActiveView;
  pathname: string | null;
  onNavigate: SidebarProps["onNavigate"];
}) {
  const isOrganisationRoute = pathname?.startsWith("/organisation") ?? false;
  const [open, setOpen] = useState(isOrganisationRoute);

  return (
    <div className="border-b border-slate-200 pb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold tracking-wider text-orange-600"
      >
        <span className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          ORGANISATION
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
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
    </div>
  );
}
