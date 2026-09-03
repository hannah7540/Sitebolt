import type { ReactNode } from "react";
import WorkerDashboardSignOutButton from "@/components/workers/WorkerDashboardSignOutButton";

export default function WorkerDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <WorkerDashboardSignOutButton />
    </>
  );
}
