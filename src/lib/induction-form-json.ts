import type {
  InductionFormBlock,
  InductionFormLogicRule,
} from "./induction-form-builder";
import { sanitizeBlockOptions } from "./induction-form-builder";
import { normalizeLogicRule } from "./induction-form-logic";

export interface InductionFormJsonDocument {
  blocks: InductionFormBlock[];
  schema_fields: InductionFormBlock[];
  logic_rules: InductionFormLogicRule[];
}

export function serializeInductionFormJson(
  schemaFields: InductionFormBlock[],
  logicRules: InductionFormLogicRule[]
): string {
  const document: InductionFormJsonDocument = {
    blocks: schemaFields,
    schema_fields: schemaFields,
    logic_rules: logicRules,
  };
  return JSON.stringify(document, null, 2);
}

function normalizeSchemaField(raw: unknown, index: number): InductionFormBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = String(row.type ?? "text_input") as InductionFormBlock["type"];
  return {
    id: String(row.id ?? `block-${index}`),
    type,
    label: String(row.label ?? "Field"),
    content: row.content ? String(row.content) : "",
    options:
      type === "multi_checkbox" || type === "radio"
        ? sanitizeBlockOptions(row.options)
        : Array.isArray(row.options)
          ? row.options.map(String)
          : [],
    pdfUrl: row.pdfUrl ? String(row.pdfUrl) : undefined,
    required: row.required === true,
  };
}

export function parseInductionFormJson(text: string): {
  error: string | null;
  schema_fields: InductionFormBlock[];
  logic_rules: InductionFormLogicRule[];
  schemaFieldsTouched: boolean;
  logicRulesTouched: boolean;
} {
  const empty = {
    schema_fields: [] as InductionFormBlock[],
    logic_rules: [] as InductionFormLogicRule[],
    schemaFieldsTouched: false,
    logicRulesTouched: false,
  };

  const trimmed = text.trim();
  if (!trimmed) {
    return { error: null, ...empty };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return {
      error: `Invalid JSON Syntax: ${message}`,
      ...empty,
    };
  }

  if (Array.isArray(parsed)) {
    const logic_rules = parsed
      .map((row) => normalizeLogicRule(row))
      .filter((row): row is InductionFormLogicRule => row !== null);

    if (logic_rules.length !== parsed.length) {
      return {
        error:
          "Invalid JSON Syntax: logic rule array contains malformed entries. Each rule needs field_id, action, and when.field.",
        ...empty,
      };
    }

    return {
      error: null,
      schema_fields: [],
      logic_rules,
      schemaFieldsTouched: false,
      logicRulesTouched: true,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      error: "Invalid JSON Syntax: expected an object or logic_rules array.",
      ...empty,
    };
  }

  const document = parsed as Record<string, unknown>;
  const schemaRaw = document.schema_fields ?? document.blocks;
  const rulesRaw = document.logic_rules;
  const schemaFieldsTouched = Array.isArray(schemaRaw);
  const logicRulesTouched = Array.isArray(rulesRaw);

  const schema_fields = schemaFieldsTouched
    ? schemaRaw
        .map((row, index) => normalizeSchemaField(row, index))
        .filter((row): row is InductionFormBlock => row !== null)
    : [];

  if (schemaFieldsTouched && schema_fields.length !== schemaRaw.length) {
    return {
      error: "Invalid JSON Syntax: schema_fields contains malformed field entries.",
      ...empty,
    };
  }

  const logic_rules = logicRulesTouched
    ? rulesRaw
        .map((row) => normalizeLogicRule(row))
        .filter((row): row is InductionFormLogicRule => row !== null)
    : [];

  if (logicRulesTouched && logic_rules.length !== rulesRaw.length) {
    return {
      error: "Invalid JSON Syntax: logic_rules contains malformed rule entries.",
      ...empty,
    };
  }

  if (!schemaFieldsTouched && !logicRulesTouched) {
    return {
      error:
        "Invalid JSON Syntax: object must include blocks, schema_fields, and/or logic_rules arrays.",
      ...empty,
    };
  }

  return {
    error: null,
    schema_fields,
    logic_rules,
    schemaFieldsTouched,
    logicRulesTouched,
  };
}

export function resolveInductionFormJsonState(
  text: string,
  currentBlocks: InductionFormBlock[],
  currentRules: InductionFormLogicRule[]
): {
  error: string | null;
  formBlocks: InductionFormBlock[];
  logicRules: InductionFormLogicRule[];
} {
  const parsed = parseInductionFormJson(text);
  if (parsed.error) {
    return {
      error: parsed.error,
      formBlocks: currentBlocks,
      logicRules: currentRules,
    };
  }

  return {
    error: null,
    formBlocks: parsed.schemaFieldsTouched ? parsed.schema_fields : currentBlocks,
    logicRules: parsed.logicRulesTouched ? parsed.logic_rules : currentRules,
  };
}

export function formatInductionFormJson(text: string): {
  error: string | null;
  formatted: string;
} {
  const parsed = parseInductionFormJson(text);
  if (parsed.error) {
    return { error: parsed.error, formatted: text };
  }

  const schema_fields =
    parsed.schema_fields.length > 0 ? parsed.schema_fields : [];
  return {
    error: null,
    formatted: serializeInductionFormJson(schema_fields, parsed.logic_rules),
  };
}
