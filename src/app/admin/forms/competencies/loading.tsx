import { TableSkeleton } from "@/components/ui/RouteLoadingFallback";

export default function AdminCompetenciesLoading() {
  return <TableSkeleton label="Loading competency register…" rows={10} />;
}
