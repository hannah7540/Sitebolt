export type PodStatus = "vacant" | "occupied" | "needs_clean";

export interface CampPod {
  id: string;
  zone: "Zone A" | "Zone B" | "Zone C";
  label: string;
  status: PodStatus;
  resident: string | null;
  company: string | null;
  genderWing: "Male" | "Female" | "Mixed";
  cleaningStatus: string;
  emergencyContact: string;
  vehicleRego: string | null;
}

export const CAMP_PODS: CampPod[] = [
  {
    id: "a-01",
    zone: "Zone A",
    label: "A-01",
    status: "occupied",
    resident: "Sam Taylor",
    company: "Apex Civil",
    genderWing: "Male",
    cleaningStatus: "Occupied — clean on departure",
    emergencyContact: "Casey Morgan · 0400 111 222",
    vehicleRego: "ABC123",
  },
  {
    id: "a-02",
    zone: "Zone A",
    label: "A-02",
    status: "vacant",
    resident: null,
    company: null,
    genderWing: "Male",
    cleaningStatus: "Vacant & Clean",
    emergencyContact: "—",
    vehicleRego: null,
  },
  {
    id: "a-03",
    zone: "Zone A",
    label: "A-03",
    status: "needs_clean",
    resident: null,
    company: "Southern Grid Pty Ltd",
    genderWing: "Male",
    cleaningStatus: "Priority turnaround — same-day arrival",
    emergencyContact: "—",
    vehicleRego: null,
  },
  {
    id: "a-04",
    zone: "Zone A",
    label: "A-04",
    status: "occupied",
    resident: "Jordan Reid",
    company: "Southern Grid Pty Ltd",
    genderWing: "Male",
    cleaningStatus: "Occupied",
    emergencyContact: "Alex Quinn · 0400 333 444",
    vehicleRego: "XYZ987",
  },
  {
    id: "b-01",
    zone: "Zone B",
    label: "B-01",
    status: "vacant",
    resident: null,
    company: null,
    genderWing: "Female",
    cleaningStatus: "Vacant & Clean",
    emergencyContact: "—",
    vehicleRego: null,
  },
  {
    id: "b-02",
    zone: "Zone B",
    label: "B-02",
    status: "occupied",
    resident: "Riley Chen",
    company: "Apex Civil",
    genderWing: "Female",
    cleaningStatus: "Occupied",
    emergencyContact: "Morgan Lee · 0400 555 666",
    vehicleRego: "DEF456",
  },
  {
    id: "b-03",
    zone: "Zone B",
    label: "B-03",
    status: "needs_clean",
    resident: null,
    company: "Northline Services",
    genderWing: "Female",
    cleaningStatus: "Priority turnaround",
    emergencyContact: "—",
    vehicleRego: null,
  },
  {
    id: "b-04",
    zone: "Zone B",
    label: "B-04",
    status: "occupied",
    resident: "Jamie Brooks",
    company: "Northline Services",
    genderWing: "Female",
    cleaningStatus: "Occupied",
    emergencyContact: "Taylor Brooks · 0400 777 888",
    vehicleRego: "GHI789",
  },
  {
    id: "c-01",
    zone: "Zone C",
    label: "C-01",
    status: "vacant",
    resident: null,
    company: null,
    genderWing: "Mixed",
    cleaningStatus: "Vacant & Clean",
    emergencyContact: "—",
    vehicleRego: null,
  },
  {
    id: "c-02",
    zone: "Zone C",
    label: "C-02",
    status: "occupied",
    resident: "Cameron Blake",
    company: "Apex Civil",
    genderWing: "Mixed",
    cleaningStatus: "Occupied",
    emergencyContact: "Pat Blake · 0400 999 000",
    vehicleRego: "JKL321",
  },
  {
    id: "c-03",
    zone: "Zone C",
    label: "C-03",
    status: "vacant",
    resident: null,
    company: null,
    genderWing: "Mixed",
    cleaningStatus: "Vacant & Clean",
    emergencyContact: "—",
    vehicleRego: null,
  },
  {
    id: "c-04",
    zone: "Zone C",
    label: "C-04",
    status: "needs_clean",
    resident: null,
    company: "Southern Grid Pty Ltd",
    genderWing: "Mixed",
    cleaningStatus: "Priority turnaround — evening arrival",
    emergencyContact: "—",
    vehicleRego: null,
  },
];

export const CAMP_ZONES = ["Zone A", "Zone B", "Zone C"] as const;

export const POD_STATUS_STYLES: Record<
  PodStatus,
  { fill: string; label: string; ring: string }
> = {
  vacant: {
    fill: "#10B981",
    label: "Vacant & Clean",
    ring: "ring-emerald-500/40",
  },
  occupied: {
    fill: "#3B82F6",
    label: "Occupied",
    ring: "ring-blue-500/40",
  },
  needs_clean: {
    fill: "#F59E0B",
    label: "Needs Clean",
    ring: "ring-amber-500/40",
  },
};
