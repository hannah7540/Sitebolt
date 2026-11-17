import type { AdminItpTemplateKey } from "@/components/itc/admin/itp-itc-admin-types";
import { drawingNameFromUploadFile } from "@/components/itc/admin/itp-itc-admin-numbering";

export interface ParsedItpPlanFilename {
  drawingName: string;
  /** Area / location token when detected (e.g. MP0). */
  area: string | null;
  /** Template inferred from discipline codes in the filename. */
  templateKey: AdminItpTemplateKey | null;
  /** True when area and/or template were inferred from the filename. */
  autoSelected: boolean;
  /** Human-readable reason for the UI confirm banner. */
  message: string | null;
}

const AREA_TOKEN = /^(MP|WP)\d+[A-Z]?$/i;

/**
 * Parse an uploaded plan filename such as `SYD-MP0-ELC-APP-SD-0001-00.pdf`.
 * - `ELC` → Electrical & Communications template
 * - `MP0` / `WP7` style tokens → Area autofill
 */
export function parseItpPlanFilename(fileName: string): ParsedItpPlanFilename {
  const drawingName = drawingNameFromUploadFile(fileName);
  const rawTokens = drawingName.split(/[-_\s]+/).filter(Boolean);
  const upperTokens = rawTokens.map((token) => token.toUpperCase());

  let area: string | null = null;
  for (let index = 0; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (token && AREA_TOKEN.test(token)) {
      area = token.toUpperCase();
      break;
    }
  }

  let templateKey: AdminItpTemplateKey | null = null;
  if (upperTokens.includes("ELC")) {
    templateKey = "electrical_comms_pit_pipe";
  }

  const autoSelected = Boolean(area || templateKey);
  let message: string | null = null;
  if (templateKey) {
    message = "Template auto-selected from filename. Please confirm or change.";
  } else if (area) {
    message = "Area auto-selected from filename. Please confirm or change.";
  }

  return {
    drawingName,
    area,
    templateKey,
    autoSelected,
    message,
  };
}
