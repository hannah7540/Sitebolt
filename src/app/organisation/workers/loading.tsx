import { TableSkeleton } from "@/components/ui/RouteLoadingFallback";

export default function OrganisationWorkersLoading() {
  return <TableSkeleton label="Loading workers…" rows={12} />;
}
