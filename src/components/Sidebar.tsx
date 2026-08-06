"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  Clock,
  Scale,
  type LucideIcon,
} from "lucide-react";
import {
  filterActiveProjects,
  type DbProject,
} from "@/lib/project-resolver";
import { resolveProjectNavHref } from "@/lib/project-nav-routes";
import {
  canAccessAccountsArea,
  canManageAdministration,
  canManageOrganisation,
  canManageSecuritySettings,
  type SecurityRole,
  type AccountsAccessRole,
} from "@/lib/security-roles";
import { cn } from "@/lib/utils";

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
  | "admin-plant-calendar"
  | "admin-worker-calendar"
  | "admin-swms"
  | "admin-document-pack"
  | "admin-compliance"
  | "admin-reporting"
  | "my-profile"
  | "org-company"
  | "org-dashboard"
  | "org-insurances"
  | "org-projects"
  | "org-workers"
  | "org-plant"
  | "org-assets"
  | "org-security";

export interface NavigateOptions {
  openAdd?: boolean;
  projectId?: string;
}

interface SidebarProps {
  activeView: ActiveView;
  projects: DbProject[];
  selectedProjectId?: string | null;
  sessionRole: SecurityRole;
  accountsAccessRole?: AccountsAccessRole;
  canAccessAccounts?: boolean;
  permissionsLoading?: boolean;
  onNavigate: (view: ActiveView, options?: NavigateOptions) => void;
  profileName?: string;
  onOpenProfile?: () => void;
}

interface SubItem {
  label: string;
  view?: ActiveView;
  href?: string;
  openAdd?: boolean;
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
}

interface SidebarMenuGroup {
  title: string;
  icon: LucideIcon;
  isCollapsible: boolean;
  defaultExpanded: boolean;
  children: SidebarMenuChild[];
}

const ACCOUNTS_MENU: SidebarMenuGroup = {
  title: "ACCOUNTS",
  icon: ReceiptText,
  isCollapsible: true,
  defaultExpanded: true,
  children: [
    {
      title: "Timesheets",
      href: "/accounts/timesheets",
      icon: Clock,
    },
    {
      title: "Pay Rules",
      href: "/accounts/pay-rules",
      icon: Scale,
    },
  ],
};

function isNestedGroup(item: SubItem | NestedGroup): item is NestedGroup {
  return "items" in item && Array.isArray(item.items);
}

function NavLink({
  label,
  depth = 0,
  active,
  icon: Icon,
  onClick,
}: {
  label: string;
  depth?: number;
  active?: boolean;
  icon?: LucideIcon;
  onClick?: () => void;
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
      <span className="truncate">{label}</span>
    </button>
  );
}

function RouteNavLink({
  label,
  href,
  depth = 0,
  active,
  icon,
}: {
  label: string;
  href: string;
  depth?: number;
  active?: boolean;
  icon?: LucideIcon;
}) {
  const router = useRouter();

  return (
    <NavLink
      label={label}
      depth={depth}
      active={active}
      icon={icon}
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
  const isSelectedProject = projectId === selectedProjectId;
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
            const href = resolveProjectNavHref(sub, projectId);
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
                          projectId,
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
  accountsAccessRole = "disabled",
  canAccessAccounts = false,
  permissionsLoading = false,
  onNavigate,
  profileName = "J. Miller",
  onOpenProfile,
}: SidebarProps) {
  const pathname = usePathname();
  const profileActive = activeView === "my-profile";
  const showOrganisation = canManageOrganisation(sessionRole);
  const showAdministration = canManageAdministration(sessionRole);
  const showSecurity = canManageSecuritySettings(sessionRole);
  const showAccounts =
    permissionsLoading ||
    canAccessAccountsArea({
      securityRole: sessionRole,
      accountsAccessRole,
      canAccessAccounts,
    });

  const activeProjects = useMemo(
    () => filterActiveProjects(projects),
    [projects]
  );
  const projectItems = useMemo(
    () => buildProjectNav(activeProjects),
    [activeProjects]
  );

  const organisationItems: SubItem[] = [
    { label: "Profile Dashboard", view: "org-dashboard" },
    { label: "Company Information", view: "org-company" },
    { label: "Insurances", view: "org-insurances" },
    { label: "Projects", view: "org-projects" },
    { label: "Workers", view: "org-workers" },
    { label: "Plant", view: "org-plant" },
    { label: "Fleet", href: "/organisation/fleet" },
    { label: "Assets", view: "org-assets" },
    ...(showSecurity
      ? [{ label: "Security Settings", view: "org-security" as const }]
      : []),
  ];

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-white lg:w-80">
      <button
        type="button"
        onClick={onOpenProfile}
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
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 ring-2",
              profileActive ? "ring-white/40" : "ring-orange-200"
            )}
          >
            <HardHat className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate text-sm font-semibold",
                profileActive ? "text-white" : "text-slate-900"
              )}
            >
              {profileName}
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
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500">
          <HardHat className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-bold tracking-tight text-slate-900">
          Site<span className="text-orange-500">Bolt</span>
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <ProjectsSection
          projects={projectItems}
          activeView={activeView}
          selectedProjectId={selectedProjectId}
          onNavigate={onNavigate}
        />

        {showAdministration && (
          <AdministrationSection
            activeView={activeView}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        )}

        <SubcontractorsSection activeView={activeView} onNavigate={onNavigate} />

        {showAccounts && (
          <AccountsSection menu={ACCOUNTS_MENU} pathname={pathname} />
        )}

        {showOrganisation && (
          <OrganisationSection
            items={organisationItems}
            activeView={activeView}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        )}
      </nav>

      <div className="border-t border-slate-200 p-4">
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
  const [open, setOpen] = useState(true);

  return (
    <div className="border-b border-slate-200 pb-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold tracking-wider text-orange-600"
      >
        <span className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4" />
          PROJECTS
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="space-y-1 px-2">
          {projects.map((project, index) => (
            <ProjectAccordion
              key={project.id ?? project.label}
              project={project}
              defaultExpanded={
                project.id === selectedProjectId ||
                (!selectedProjectId && index === 0)
              }
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
  const [open, setOpen] = useState(isFormsRoute);
  const [formsOpen, setFormsOpen] = useState(isFormsRoute);
  const items: SubItem[] = [
    { label: "Full Plant Calendar", view: "admin-plant-calendar" },
    { label: "Full Worker Calendar", view: "admin-worker-calendar" },
    { label: "SWMS", view: "admin-swms" },
    { label: "1-Click Document Pack", view: "admin-document-pack" },
    { label: "Compliance / Notifications", view: "admin-compliance" },
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
          <div>
            <button
              type="button"
              onClick={() => setFormsOpen(!formsOpen)}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-orange-50 hover:text-orange-600"
            >
              <span className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-slate-400" />
                Forms & Registers
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
        <div className="space-y-1 px-2">
          {items.map((item) =>
            item.href ? (
              <RouteNavLink
                key={item.label}
                label={item.label}
                href={item.href}
                active={
                  pathname === item.href || pathname?.startsWith(`${item.href}/`)
                }
              />
            ) : (
              <NavLink
                key={item.label}
                label={item.label}
                active={item.view === activeView}
                onClick={
                  item.view ? () => onNavigate(item.view!) : undefined
                }
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
