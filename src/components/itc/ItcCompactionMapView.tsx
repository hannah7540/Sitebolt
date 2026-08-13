"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Plus } from "lucide-react";
import {
  createCompactionTest,
  fetchCompactionTests,
  readBrowserGeolocation,
  type ItcCompactionTest,
} from "@/lib/itc-compaction-service";
import { fetchProjectItcs, type ProjectItc } from "@/lib/itc-service";
import {
  computeGpsBounds,
  gpsToRelativeMapPosition,
  haversineDistanceMeters,
  ITC_COMPACTION_PROXIMITY_METERS,
} from "@/lib/itc-geo-utils";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ItcCompactionMapViewProps {
  projectId: string;
}

export default function ItcCompactionMapView({ projectId }: ItcCompactionMapViewProps) {
  const [tests, setTests] = useState<ItcCompactionTest[]>([]);
  const [itcs, setItcs] = useState<ProjectItc[]>([]);
  const [testNumber, setTestNumber] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [testRows, itcRows] = await Promise.all([
      fetchCompactionTests(projectId),
      fetchProjectItcs(projectId),
    ]);
    setTests(testRows);
    setItcs(itcRows);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const captureGps = async () => {
    setMessage(null);
    const position = await readBrowserGeolocation();
    if (!position) {
      setMessage("Could not read GPS from this device.");
      return;
    }
    setGps(position);
    setMessage(`GPS captured: ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`);
  };

  const handleCreateTest = async () => {
    if (!testNumber.trim()) {
      setMessage("Enter a compaction test number.");
      return;
    }
    setSaving(true);
    setMessage(null);
    const result = await createCompactionTest({
      projectId,
      testNumber: testNumber.trim(),
      companyName,
      technicianName,
      gpsLat: gps?.lat,
      gpsLng: gps?.lng,
    });
    setSaving(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setTestNumber("");
    setMessage(
      result.test?.linked_itc_ids?.length
        ? `Test logged and auto-linked to ${result.test.linked_itc_ids.length} nearby ITC(s) within ${ITC_COMPACTION_PROXIMITY_METERS}m.`
        : "Compaction test logged."
    );
    void load();
  };

  const mapPoints = useMemo(() => {
    const testPoints = tests
      .filter((test) => test.gps_lat != null && test.gps_lng != null)
      .map((test) => ({ lat: test.gps_lat!, lng: test.gps_lng!, type: "test" as const, id: test.id }));
    const itcPoints = itcs
      .filter((itc) => itc.gps_lat != null && itc.gps_lng != null)
      .map((itc) => ({ lat: itc.gps_lat!, lng: itc.gps_lng!, type: "itc" as const, id: itc.id }));
    return [...testPoints, ...itcPoints];
  }, [tests, itcs]);

  const bounds = useMemo(() => computeGpsBounds(mapPoints), [mapPoints]);

  const positionedTests = useMemo(() => {
    if (!bounds) return [];
    return tests
      .filter((test) => test.gps_lat != null && test.gps_lng != null)
      .map((test) => ({
        test,
        pos: gpsToRelativeMapPosition(
          { lat: test.gps_lat!, lng: test.gps_lng! },
          bounds
        ),
      }));
  }, [tests, bounds]);

  const positionedItcs = useMemo(() => {
    if (!bounds) return [];
    return itcs
      .filter((itc) => itc.gps_lat != null && itc.gps_lng != null)
      .map((itc) => ({
        itc,
        pos: gpsToRelativeMapPosition({ lat: itc.gps_lat!, lng: itc.gps_lng! }, bounds),
      }));
  }, [itcs, bounds]);

  const proximityLinks = useMemo(() => {
    const links: Array<{ testNumber: string; itcNumber: string; distanceM: number }> = [];
    for (const test of tests) {
      if (test.gps_lat == null || test.gps_lng == null) continue;
      for (const itc of itcs) {
        if (itc.gps_lat == null || itc.gps_lng == null) continue;
        const distanceM = haversineDistanceMeters(
          test.gps_lat,
          test.gps_lng,
          itc.gps_lat,
          itc.gps_lng
        );
        if (distanceM <= ITC_COMPACTION_PROXIMITY_METERS) {
          links.push({
            testNumber: test.test_number,
            itcNumber: itc.itc_number,
            distanceM,
          });
        }
      }
    }
    return links;
  }, [tests, itcs]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
        Loading compaction map…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className={cardClass}>
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-lg font-bold text-slate-900">GPS Compaction Map</h2>
            <p className="text-sm text-slate-500">
              Orange pins = compaction tests. Blue pins = ITC locations. Auto-link within{" "}
              {ITC_COMPACTION_PROXIMITY_METERS}m (Haversine).
            </p>
          </div>

          <div className="relative aspect-[16/10] min-h-[280px] bg-gradient-to-br from-slate-100 via-white to-sky-50">
            <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:20px_20px]" />

            {!bounds ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
                Log a compaction test with GPS to populate the map.
              </div>
            ) : (
              <>
                {positionedItcs.map(({ itc, pos }) => (
                  <button
                    key={itc.id}
                    type="button"
                    title={`ITC ${itc.itc_number}`}
                    className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 shadow"
                    style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
                  />
                ))}
                {positionedTests.map(({ test, pos }) => (
                  <button
                    key={test.id}
                    type="button"
                    title={`${test.test_number} — ${test.company_name ?? "Unknown"}`}
                    onClick={() => setSelectedTestId(test.id)}
                    className={cn(
                      "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow transition hover:scale-110",
                      selectedTestId === test.id
                        ? "h-5 w-5 bg-orange-700 ring-4 ring-orange-200"
                        : "h-4 w-4 bg-orange-500"
                    )}
                    style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        <div className={cardClass}>
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="font-semibold text-slate-900">Log Compaction Test</h3>
          </div>
          <div className="space-y-3 p-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Test Number
              </span>
              <input
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value)}
                className={inputClass}
                placeholder="CT-2026-014"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Testing Company
              </span>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Tester Name
              </span>
              <input
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              onClick={() => void captureGps()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
            >
              <MapPin className="h-4 w-4" />
              {gps
                ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
                : "Capture Current GPS"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleCreateTest()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Drop Pin &amp; Log Test
            </button>
            {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-900">Proximity Auto-Links (&le; 2m)</h3>
        </div>
        {proximityLinks.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">
            No auto-links yet. Ensure ITCs and compaction tests have GPS coordinates within 2
            meters.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {proximityLinks.map((link) => (
              <li key={`${link.testNumber}-${link.itcNumber}`} className="px-4 py-3 text-sm">
                <span className="font-semibold text-orange-700">{link.testNumber}</span>
                {" → "}
                <span className="font-semibold text-sky-700">{link.itcNumber}</span>
                <span className="text-slate-500"> ({link.distanceM.toFixed(2)} m)</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={cardClass}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-900">Compaction Test Register</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Test #</th>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Tester</th>
                <th className="px-4 py-2">GPS</th>
                <th className="px-4 py-2">Linked ITCs</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((test) => (
                <tr key={test.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-semibold">{test.test_number}</td>
                  <td className="px-4 py-2">{test.company_name ?? "—"}</td>
                  <td className="px-4 py-2">{test.technician_name ?? "—"}</td>
                  <td className="px-4 py-2">
                    {test.gps_lat != null && test.gps_lng != null
                      ? `${test.gps_lat.toFixed(5)}, ${test.gps_lng.toFixed(5)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {test.linked_itc_ids?.length
                      ? `${test.linked_itc_ids.length} linked`
                      : "None"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
