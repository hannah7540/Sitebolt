import type { CompanyCalendarDayType, CompanyCalendarState } from "./company-calendar-days";

export interface CompanyCalendarSeedDay {
  date: string;
  day_type: CompanyCalendarDayType;
  title: string;
  state: CompanyCalendarState;
}

const NSW_ACT_SHARED_2026: Array<Omit<CompanyCalendarSeedDay, "state">> = [
  { date: "2026-01-01", day_type: "public_holiday", title: "New Year's Day" },
  { date: "2026-01-26", day_type: "public_holiday", title: "Australia Day" },
  { date: "2026-04-03", day_type: "public_holiday", title: "Good Friday" },
  { date: "2026-04-04", day_type: "public_holiday", title: "Easter Saturday" },
  { date: "2026-04-05", day_type: "public_holiday", title: "Easter Sunday" },
  { date: "2026-04-06", day_type: "public_holiday", title: "Easter Monday" },
  { date: "2026-04-25", day_type: "public_holiday", title: "Anzac Day" },
  { date: "2026-06-08", day_type: "public_holiday", title: "King's Birthday" },
  { date: "2026-10-05", day_type: "public_holiday", title: "Labour Day" },
  { date: "2026-12-25", day_type: "public_holiday", title: "Christmas Day" },
  { date: "2026-12-26", day_type: "public_holiday", title: "Boxing Day" },
  { date: "2026-12-28", day_type: "public_holiday", title: "Boxing Day (additional)" },
];

export const PUBLIC_HOLIDAYS_2026: CompanyCalendarSeedDay[] = [
  ...NSW_ACT_SHARED_2026.map((day) => ({ ...day, state: "NSW" as const })),
  ...NSW_ACT_SHARED_2026.map((day) => ({ ...day, state: "ACT" as const })),
  {
    date: "2026-03-09",
    day_type: "public_holiday",
    title: "Canberra Day",
    state: "ACT",
  },
  {
    date: "2026-06-01",
    day_type: "public_holiday",
    title: "Reconciliation Day",
    state: "ACT",
  },
  { date: "2026-01-01", day_type: "public_holiday", title: "New Year's Day", state: "WA" },
  { date: "2026-01-26", day_type: "public_holiday", title: "Australia Day", state: "WA" },
  { date: "2026-03-02", day_type: "public_holiday", title: "Labour Day", state: "WA" },
  { date: "2026-04-03", day_type: "public_holiday", title: "Good Friday", state: "WA" },
  { date: "2026-04-06", day_type: "public_holiday", title: "Easter Monday", state: "WA" },
  { date: "2026-04-25", day_type: "public_holiday", title: "Anzac Day", state: "WA" },
  {
    date: "2026-04-27",
    day_type: "public_holiday",
    title: "Anzac Day (additional)",
    state: "WA",
  },
  {
    date: "2026-06-01",
    day_type: "public_holiday",
    title: "Western Australia Day",
    state: "WA",
  },
  { date: "2026-09-28", day_type: "public_holiday", title: "King's Birthday", state: "WA" },
  { date: "2026-12-25", day_type: "public_holiday", title: "Christmas Day", state: "WA" },
  { date: "2026-12-26", day_type: "public_holiday", title: "Boxing Day", state: "WA" },
  {
    date: "2026-12-28",
    day_type: "public_holiday",
    title: "Boxing Day (additional)",
    state: "WA",
  },
  { date: "2026-01-01", day_type: "public_holiday", title: "New Year's Day", state: "NZ" },
  {
    date: "2026-01-02",
    day_type: "public_holiday",
    title: "Day after New Year's Day",
    state: "NZ",
  },
  { date: "2026-02-06", day_type: "public_holiday", title: "Waitangi Day", state: "NZ" },
  { date: "2026-04-03", day_type: "public_holiday", title: "Good Friday", state: "NZ" },
  { date: "2026-04-06", day_type: "public_holiday", title: "Easter Monday", state: "NZ" },
  { date: "2026-04-25", day_type: "public_holiday", title: "Anzac Day", state: "NZ" },
  {
    date: "2026-04-27",
    day_type: "public_holiday",
    title: "Anzac Day (Mondayised)",
    state: "NZ",
  },
  { date: "2026-06-01", day_type: "public_holiday", title: "King's Birthday", state: "NZ" },
  { date: "2026-07-10", day_type: "public_holiday", title: "Matariki", state: "NZ" },
  { date: "2026-10-26", day_type: "public_holiday", title: "Labour Day", state: "NZ" },
  { date: "2026-12-25", day_type: "public_holiday", title: "Christmas Day", state: "NZ" },
  { date: "2026-12-26", day_type: "public_holiday", title: "Boxing Day", state: "NZ" },
];
