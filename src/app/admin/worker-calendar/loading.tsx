import { CalendarSkeleton } from "@/components/ui/RouteLoadingFallback";

export default function AdminWorkerCalendarLoading() {
  return <CalendarSkeleton label="Loading full worker calendar…" />;
}
