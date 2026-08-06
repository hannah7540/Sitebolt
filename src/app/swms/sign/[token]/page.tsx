"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { fetchSwmsAssignmentByToken } from "@/lib/swms";
import WorkerSwmsSignModal from "@/components/workers/WorkerSwmsSignModal";

export default function SwmsSignPage() {
  const params = useParams();
  const token = params.token as string;
  const [assignment, setAssignment] = useState<
    Awaited<ReturnType<typeof fetchSwmsAssignmentByToken>>
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    async function load() {
      const row = await fetchSwmsAssignmentByToken(token);
      if (!row) {
        setError("Signing link is invalid or has expired.");
      } else {
        setAssignment(row);
      }
      setLoading(false);
    }
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-transparent px-4 text-center">
        <AlertCircle className="mb-3 h-12 w-12 text-red-500" />
        <p className="text-slate-600">{error ?? "Unable to load SWMS assignment."}</p>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-transparent px-4 text-center">
        <p className="text-2xl font-bold text-slate-900">SWMS Signed</p>
        <p className="mt-2 text-sm text-slate-600">
          Thank you. Your signature has been recorded for{" "}
          {assignment.swms?.title ?? "this SWMS"}.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent p-4">
      <WorkerSwmsSignModal
        assignment={assignment}
        onClose={() => setCompleted(true)}
        onSigned={() => setCompleted(true)}
      />
    </div>
  );
}
