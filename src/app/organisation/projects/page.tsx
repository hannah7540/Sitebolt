"use client";

import { useCallback } from "react";
import ProjectsManagementPanel from "@/components/organisation/ProjectsManagementPanel";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import { fetchProjects } from "@/lib/project-resolver";

export default function OrganisationProjectsPage() {
  const { workers } = useAdminConsole();

  const handleProjectsChanged = useCallback(async () => {
    await fetchProjects();
  }, []);

  return (
    <ProjectsManagementPanel workers={workers} onProjectsChanged={() => void handleProjectsChanged()} />
  );
}
