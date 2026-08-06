export type ItpStatus = "draft" | "in_progress" | "submitted" | "approved";
export type ItpPointType = "H" | "W" | "S" | "R";
export type ItpItemStatus = "pending" | "conforming" | "non_conforming" | "na";

export interface ItpTemplateItem {
  item_number: number;
  description: string;
  acceptance_criteria: string;
  point_type: ItpPointType;
}

export interface ItpTemplate {
  key: string;
  title: string;
  trade_category: string;
  description: string;
  items: ItpTemplateItem[];
}

export const ITP_TRADE_CATEGORIES = [
  "Concrete",
  "Earthworks",
  "Steel",
  "Electrical",
  "Plumbing",
  "General",
] as const;

export type ItpTradeCategory = (typeof ITP_TRADE_CATEGORIES)[number];

export const ITP_STATUS_LABELS: Record<ItpStatus, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  submitted: "Submitted",
  approved: "Approved",
};

export const ITP_POINT_TYPE_LABELS: Record<ItpPointType, string> = {
  H: "Hold Point",
  W: "Witness Point",
  S: "Surveillance",
  R: "Review",
};

export const ITP_ITEM_STATUS_LABELS: Record<ItpItemStatus, string> = {
  pending: "Pending",
  conforming: "Conforming",
  non_conforming: "Non-Conforming",
  na: "N/A",
};

export const ITP_POINT_TYPE_BADGE: Record<ItpPointType, string> = {
  H: "bg-red-100 text-red-800 border-red-300",
  W: "bg-amber-100 text-amber-800 border-amber-300",
  S: "bg-blue-100 text-blue-800 border-blue-300",
  R: "bg-violet-100 text-violet-800 border-violet-300",
};

export const DEFAULT_ITP_TEMPLATES: ItpTemplate[] = [
  {
    key: "pre_pour_concrete",
    title: "Pre-Pour Concrete Inspection",
    trade_category: "Concrete",
    description: "Standard pre-pour checks for formwork, reinforcement, and embeds.",
    items: [
      {
        item_number: 1,
        description: "Formwork alignment, cleanliness, and release agent applied",
        acceptance_criteria: "AS 3610 / project drawings — tolerances within spec",
        point_type: "W",
      },
      {
        item_number: 2,
        description: "Reinforcement type, cover, laps, and chairs/spacers",
        acceptance_criteria: "AS 3600 — cover and lap lengths per drawing",
        point_type: "H",
      },
      {
        item_number: 3,
        description: "Embedded items, cast-in services, and penetration sleeves",
        acceptance_criteria: "Coordination drawings signed off",
        point_type: "W",
      },
      {
        item_number: 4,
        description: "Pre-pour hold point clearance by engineer",
        acceptance_criteria: "Engineer inspection prior to pour",
        point_type: "H",
      },
      {
        item_number: 5,
        description: "Concrete delivery tickets and mix design verification",
        acceptance_criteria: "Approved mix design on site",
        point_type: "S",
      },
    ],
  },
  {
    key: "earthworks_compaction",
    title: "Earthworks Compaction Inspection",
    trade_category: "Earthworks",
    description: "Subgrade preparation and compaction verification.",
    items: [
      {
        item_number: 1,
        description: "Strip and proof-roll subgrade; remove unsuitable material",
        acceptance_criteria: "Geotechnical report / specification",
        point_type: "W",
      },
      {
        item_number: 2,
        description: "Imported fill material approval and placement in lifts",
        acceptance_criteria: "Approved fill source; max lift thickness per spec",
        point_type: "S",
      },
      {
        item_number: 3,
        description: "Compaction testing — nuclear density / sand replacement",
        acceptance_criteria: "Minimum 95% MMDD (or per spec)",
        point_type: "H",
      },
      {
        item_number: 4,
        description: "Survey levels and surface tolerances",
        acceptance_criteria: "Within ±20 mm of design levels",
        point_type: "R",
      },
    ],
  },
  {
    key: "structural_steel",
    title: "Structural Steel Erection",
    trade_category: "Steel",
    description: "Steel member delivery, erection, and connection inspection.",
    items: [
      {
        item_number: 1,
        description: "Steel delivery inspection — marks, coatings, and damage",
        acceptance_criteria: "AS/NZS 4100 — members match delivery schedule",
        point_type: "S",
      },
      {
        item_number: 2,
        description: "Hold point — column/base plate alignment and grouting",
        acceptance_criteria: "Survey within tolerance; grout strength verified",
        point_type: "H",
      },
      {
        item_number: 3,
        description: "Bolted connections — torque / snug-tight / tension verification",
        acceptance_criteria: "Connection design / AS 4100",
        point_type: "W",
      },
      {
        item_number: 4,
        description: "Welded connections — visual and NDT where specified",
        acceptance_criteria: "Weld procedure qualification / AS 1554",
        point_type: "H",
      },
      {
        item_number: 5,
        description: "Final erection survey and bracing installation",
        acceptance_criteria: "As-built within project tolerances",
        point_type: "R",
      },
    ],
  },
];

export function getItpTemplate(key: string): ItpTemplate | undefined {
  return DEFAULT_ITP_TEMPLATES.find((template) => template.key === key);
}
