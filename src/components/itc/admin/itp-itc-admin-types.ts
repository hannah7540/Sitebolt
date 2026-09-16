export type AdminItpTemplateKey =
  | "civil_stormwater_drainage"
  | "civil_stormwater_pipe"
  | "electrical_comms_pit_pipe"
  | "fire_inground"
  | "fire_aboveground_booster"
  | "potable_water_mains"
  | "sewer_drainage"
  | "hydraulic_internal"
  | "deck_setout_penetrations"
  | "commissioning_pressure";

export interface AdminChecklistQuestion {
  key: string;
  text: string;
}

export interface AdminItpTemplate {
  key: AdminItpTemplateKey;
  title: string;
  trade: string;
  questions: AdminChecklistQuestion[];
}

export const ADMIN_PIPE_SIZES = [
  "50mm",
  "80mm",
  "100mm",
  "150mm",
  "225mm",
  "300mm",
  "375mm",
  "450mm",
] as const;

export const ADMIN_PIPE_MATERIALS = [
  "PVC",
  "PE",
  "DICL",
  "Blackmax",
  "RCP",
  "StormPRO",
  "HDPE",
  "Copper",
] as const;

export const DEFAULT_ITC_CLIENT = "Canberra Data Centre (CDC)";
export const DEFAULT_MANAGING_CONTRACTOR = "Built Pty Ltd";
export const DEFAULT_SUBCONTRACTOR = "A Plus Plumbing";

export const ADMIN_ITP_TEMPLATES: AdminItpTemplate[] = [
  {
    key: "civil_stormwater_drainage",
    title: "Civil Stormwater Drainage (Pipes & Structures)",
    trade: "Civil / Stormwater",
    questions: [
      { key: "setout", text: "Setout of pits/structures matches approved drawings" },
      { key: "excavation", text: "Excavation depth, width, and foundation are suitable" },
      { key: "bedding", text: "Bedding thickness and material comply with specification" },
      { key: "pipe_install", text: "Pipes laid to line and grade; joints sound" },
      { key: "haunch_overlay", text: "Haunching and overlay completed as specified" },
      { key: "structures", text: "Pits/headwalls built to level, plumb, and watertight" },
      { key: "backfill", text: "Backfill placed in layers without damage to works" },
      { key: "asbuilt", text: "As-built / WAE markup recorded against drawing" },
    ],
  },
  {
    key: "civil_stormwater_pipe",
    title: "Civil Stormwater Pipe (StormPRO / PVC / RCP / Blackmax)",
    trade: "Civil / Stormwater",
    questions: [
      { key: "material", text: "Pipe type, class, and diameter match approved design" },
      { key: "handling", text: "Pipes handled and stored without damage" },
      { key: "bedding", text: "Bedding and side support to manufacturer / spec" },
      { key: "joints", text: "Rubber ring / collars installed correctly and lubricated" },
      { key: "grade", text: "Line and grade within tolerance" },
      { key: "cctv", text: "CCTV / ovality check completed where required" },
      { key: "cover", text: "Minimum cover achieved prior to construction traffic" },
    ],
  },
  {
    key: "electrical_comms_pit_pipe",
    title: "Electrical & Communications (Pit & Pipe)",
    trade: "Electrical / Comms",
    questions: [
      { key: "setout", text: "Pit and conduit setout matches electrical / comms drawings" },
      { key: "trench", text: "Trench width, depth, and separation distances verified" },
      { key: "bedding", text: "Sand bedding and overlay installed to spec" },
      { key: "config", text: "Conduit configuration, spacers, and counts correct" },
      { key: "pits", text: "Pits installed plumb with lids, seals, and drainage" },
      { key: "tape", text: "Warning tape / marker installed at specified cover" },
      { key: "mandrel", text: "Mandrel / draw-cord prove completed" },
      { key: "asbuilt", text: "As-built pits and conduits recorded" },
    ],
  },
  {
    key: "fire_inground",
    title: "Fire Service Inground (PE / DICL)",
    trade: "Fire",
    questions: [
      { key: "material", text: "Pipe material, PN rating, and fittings approved for fire service" },
      { key: "alignment", text: "Alignment, cover, and thrust restraint as designed" },
      { key: "joints", text: "Electrofusion / restrained joints completed per procedure" },
      { key: "hydrant", text: "Hydrant / booster connections orientation correct" },
      { key: "pressure", text: "Pressure test witnessed and recorded" },
      { key: "flush", text: "Flushing and disinfection (if required) completed" },
      { key: "asbuilt", text: "In-ground fire services marked on WAE" },
    ],
  },
  {
    key: "fire_aboveground_booster",
    title: "Fire Service Above Ground & Booster",
    trade: "Fire",
    questions: [
      { key: "supports", text: "Supports, hangers, and seismic restraints installed" },
      { key: "valves", text: "Valves, boosters, and inlets labelled and accessible" },
      { key: "clearance", text: "Clearances to structure and other services maintained" },
      { key: "hydro", text: "Hydrostatic test 1700 kPa / duration per spec" },
      { key: "signage", text: "Booster signage and cabinet complete" },
      { key: "commission", text: "Authority / fire contractor inspection completed" },
    ],
  },
  {
    key: "potable_water_mains",
    title: "Potable Water & Pressure Mains (Inground)",
    trade: "Hydraulics",
    questions: [
      { key: "material", text: "PE / DICL class, PE100 PN rating, and fittings verified" },
      { key: "bedding", text: "Bedding, wrapping, and marker tape installed" },
      { key: "joints", text: "Fusion / gibault joints completed and cooled as required" },
      { key: "pressure", text: "Pressure test to AS 2566.2 / project spec" },
      { key: "disinfect", text: "Disinfection and bacteriological sampling (if required)" },
      { key: "connections", text: "Connections to existing live mains under permit" },
      { key: "asbuilt", text: "As-built alignment and valves recorded" },
    ],
  },
  {
    key: "sewer_drainage",
    title: "Sewer Drainage & Structures (Inground)",
    trade: "Hydraulics / Civil",
    questions: [
      { key: "setout", text: "MH / IO setout and invert levels match design" },
      { key: "grade", text: "Pipe grade and alignment within tolerance" },
      { key: "joints", text: "Joints clean, seated, and watertight" },
      { key: "structures", text: "Manholes benching, lids, and drops complete" },
      { key: "test", text: "Air / water tightness test passed" },
      { key: "cctv", text: "CCTV inspection completed with acceptable outcome" },
      { key: "backfill", text: "Backfill and compaction around structures complete" },
    ],
  },
  {
    key: "hydraulic_internal",
    title: "Hydraulic Internal (Elevated Drainage, Rough In, Fit Off, Stacks)",
    trade: "Hydraulics",
    questions: [
      { key: "setout", text: "Stack / rough-in setout matches hydraulic drawings" },
      { key: "supports", text: "Pipe supports, clips, and expansion provision installed" },
      { key: "falls", text: "Drainage falls and vents correct" },
      { key: "penetrations", text: "Penetrations sleeved / fire-stopped as required" },
      { key: "pressure", text: "Stack / supply pressure test completed" },
      { key: "fitoff", text: "Fit-off fixtures and isolation valves complete" },
      { key: "insulation", text: "Insulation / lagging installed where specified" },
    ],
  },
  {
    key: "deck_setout_penetrations",
    title: "Deck Setout & Penetrations",
    trade: "Coordination",
    questions: [
      { key: "setout", text: "Penetration setout coordinated against latest drawings" },
      { key: "size", text: "Sleeve size, material, and fire rating correct" },
      { key: "cover", text: "Cover to reinforcement and structural approval obtained" },
      { key: "castin", text: "Cast-in items fixed prior to pour" },
      { key: "asbuilt", text: "As-cast penetration locations recorded" },
    ],
  },
  {
    key: "commissioning_pressure",
    title: "Commissioning & Pressure Testing (1700 kPa / 2 Hours)",
    trade: "Commissioning",
    questions: [
      { key: "isolation", text: "System isolated, vents open, and gauges calibrated" },
      { key: "fill", text: "System filled and air removed" },
      { key: "hold", text: "Test pressure 1700 kPa held for 2 hours" },
      { key: "leak", text: "No visible leakage or unacceptable pressure drop" },
      { key: "record", text: "Readings, start/finish time, and witnesses recorded" },
      { key: "restore", text: "System restored; test water disposed correctly" },
    ],
  },
];

export function getAdminItpTemplate(key: string | null | undefined): AdminItpTemplate | null {
  if (!key) return null;
  return ADMIN_ITP_TEMPLATES.find((row) => row.key === key) ?? null;
}
