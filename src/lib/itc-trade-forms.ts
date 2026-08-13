import type { ItcTradeDiscipline } from "./itc-master-spec-service";
import type { ItcSpecAutoFillResult } from "./itc-master-spec-service";

export interface ItcTradeFormValues {
  zone: string;
  material_and_size: string;
  service_type: string;
  material_colour: string;
  length_m: number | null;
  length_of_run_m: number | null;
  upstream_pit_number: string;
  downstream_pit_number: string;
  number_of_conduits: number | null;
  number_of_tees: number | null;
  redline_markup_url: string;
  min_horizontal_sep_mm: number | null;
  min_vertical_sep_mm: number | null;
  min_bedding_mm: number | null;
  min_side_mm: number | null;
  min_overlay_mm: number | null;
  min_cover_mm: number | null;
  bedding_and_overlay_material: string | null;
  cover_material: string | null;
}

export const EMPTY_TRADE_FORM: ItcTradeFormValues = {
  zone: "",
  material_and_size: "",
  service_type: "",
  material_colour: "",
  length_m: null,
  length_of_run_m: null,
  upstream_pit_number: "",
  downstream_pit_number: "",
  number_of_conduits: null,
  number_of_tees: null,
  redline_markup_url: "",
  min_horizontal_sep_mm: null,
  min_vertical_sep_mm: null,
  min_bedding_mm: null,
  min_side_mm: null,
  min_overlay_mm: null,
  min_cover_mm: null,
  bedding_and_overlay_material: null,
  cover_material: null,
};

export function getTradeFormMissingFields(
  discipline: ItcTradeDiscipline,
  values: ItcTradeFormValues
): string[] {
  const missing: string[] = [];
  if (!values.zone.trim()) missing.push("Zone");
  if (!values.material_and_size.trim()) missing.push("Material & Size");

  if (discipline === "Drainage" || discipline === "Hydraulics") {
    if (!values.service_type.trim()) missing.push("Service Type");
  }

  if (discipline === "Electrical") {
    if (!values.service_type.trim()) missing.push("Service Type");
    if (values.length_m == null) missing.push("Length (m)");
    if (!values.upstream_pit_number.trim()) missing.push("Upstream Structure");
    if (!values.downstream_pit_number.trim()) missing.push("Downstream Structure");
  }

  if (discipline === "Hydraulics") {
    if (values.length_of_run_m == null) missing.push("Length of Run (m)");
    if (!values.upstream_pit_number.trim()) missing.push("Upstream Point");
    if (!values.downstream_pit_number.trim()) missing.push("Downstream Point");
  }

  return missing;
}

export function isTradeFormComplete(
  discipline: ItcTradeDiscipline,
  values: ItcTradeFormValues
): boolean {
  return getTradeFormMissingFields(discipline, values).length === 0;
}

export function applySpecAutoFillToForm(
  current: ItcTradeFormValues,
  autoFill: ItcSpecAutoFillResult
): ItcTradeFormValues {
  return {
    ...current,
    ...autoFill,
  };
}

export function tradeFormToItcPayload(
  discipline: ItcTradeDiscipline,
  values: ItcTradeFormValues
): Record<string, unknown> {
  return {
    trade_discipline: discipline,
    zone_code: values.zone || null,
    service_type: values.service_type || null,
    material_and_size: values.material_and_size || null,
    material_colour: values.material_colour || null,
    length_m: values.length_m ?? values.length_of_run_m,
    length_of_run_m: values.length_of_run_m ?? values.length_m,
    upstream_pit_number: values.upstream_pit_number || null,
    downstream_pit_number: values.downstream_pit_number || null,
    number_of_conduits: values.number_of_conduits,
    number_of_tees: values.number_of_tees,
    redline_markup_url: values.redline_markup_url || null,
    min_horizontal_sep_mm: values.min_horizontal_sep_mm,
    min_vertical_sep_mm: values.min_vertical_sep_mm,
    min_bedding_mm: values.min_bedding_mm,
    min_side_mm: values.min_side_mm,
    min_overlay_mm: values.min_overlay_mm,
    min_cover_mm: values.min_cover_mm,
    bedding_and_overlay_material: values.bedding_and_overlay_material,
    cover_material: values.cover_material,
    form_data: values,
  };
}

export function itcRowToTradeForm(row: Record<string, unknown>): ItcTradeFormValues {
  const formData =
    row.form_data && typeof row.form_data === "object"
      ? (row.form_data as Record<string, unknown>)
      : {};

  return {
    zone: String(formData.zone ?? row.zone_code ?? ""),
    material_and_size: String(formData.material_and_size ?? row.material_and_size ?? ""),
    service_type: String(formData.service_type ?? row.service_type ?? row.service_discipline ?? ""),
    material_colour: String(formData.material_colour ?? row.material_colour ?? ""),
    length_m: row.length_m != null ? Number(row.length_m) : null,
    length_of_run_m:
      row.length_of_run_m != null
        ? Number(row.length_of_run_m)
        : row.length_m != null
          ? Number(row.length_m)
          : null,
    upstream_pit_number: String(
      formData.upstream_pit_number ?? row.upstream_pit_number ?? row.start_location ?? ""
    ),
    downstream_pit_number: String(
      formData.downstream_pit_number ?? row.downstream_pit_number ?? row.end_location ?? ""
    ),
    number_of_conduits:
      row.number_of_conduits != null ? Number(row.number_of_conduits) : null,
    number_of_tees: row.number_of_tees != null ? Number(row.number_of_tees) : null,
    redline_markup_url: String(formData.redline_markup_url ?? row.redline_markup_url ?? ""),
    min_horizontal_sep_mm:
      row.min_horizontal_sep_mm != null ? Number(row.min_horizontal_sep_mm) : null,
    min_vertical_sep_mm:
      row.min_vertical_sep_mm != null ? Number(row.min_vertical_sep_mm) : null,
    min_bedding_mm: row.min_bedding_mm != null ? Number(row.min_bedding_mm) : null,
    min_side_mm: row.min_side_mm != null ? Number(row.min_side_mm) : null,
    min_overlay_mm: row.min_overlay_mm != null ? Number(row.min_overlay_mm) : null,
    min_cover_mm: row.min_cover_mm != null ? Number(row.min_cover_mm) : null,
    bedding_and_overlay_material: row.bedding_and_overlay_material
      ? String(row.bedding_and_overlay_material)
      : null,
    cover_material: row.cover_material ? String(row.cover_material) : null,
  };
}
