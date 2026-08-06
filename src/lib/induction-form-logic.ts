import type {
  InductionFormLogicCondition,
  InductionFormLogicRule,
  InductionFormLogicWhen,
} from "./induction-form-builder";

export type InductionFormAnswers = Record<string, unknown>;

const VALID_ACTIONS = new Set([
  "show",
  "hide",
  "make_mandatory",
  "make_optional",
  "block_submission",
]);

function parseCondition(raw: unknown): InductionFormLogicCondition | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const field = String(row.field ?? "").trim();
  if (!field) return null;

  const condition: InductionFormLogicCondition = { field };
  if ("equals" in row) {
    condition.equals = row.equals as InductionFormLogicCondition["equals"];
  }
  if ("not_equals" in row) {
    condition.not_equals = row.not_equals as InductionFormLogicCondition["not_equals"];
  }
  return condition;
}

export function parseLogicWhen(raw: unknown): InductionFormLogicWhen | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  if (Array.isArray(row.or)) {
    const conditions = row.or
      .map((entry) => parseCondition(entry))
      .filter((entry): entry is InductionFormLogicCondition => entry !== null);
    if (conditions.length !== row.or.length) return null;
    return { or: conditions };
  }

  return parseCondition(row);
}

export function normalizeLogicRule(raw: unknown): InductionFormLogicRule | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const fieldId = row.field_id ? String(row.field_id).trim() : "";
  const action = String(row.action ?? "").trim();
  const when = parseLogicWhen(row.when);

  if (!action || !when || !VALID_ACTIONS.has(action)) return null;
  if (action !== "block_submission" && !fieldId) return null;

  const message = row.message ? String(row.message).trim() : undefined;

  return {
    ...(fieldId ? { field_id: fieldId } : {}),
    action: action as InductionFormLogicRule["action"],
    when,
    ...(message ? { message } : {}),
  };
}

function normalizeComparable(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.map(String).sort().join("|");
  return String(value).trim().toLowerCase();
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return normalizeComparable(left) === normalizeComparable(right);
}

export function answerMatchesExpected(
  userAnswer: unknown,
  expectedValue: unknown
): boolean {
  if (userAnswer === undefined) return false;

  if (Array.isArray(userAnswer)) {
    return userAnswer.some(
      (entry) => entry === expectedValue || valuesEqual(entry, expectedValue)
    );
  }

  return userAnswer === expectedValue || valuesEqual(userAnswer, expectedValue);
}

export interface LogicRuleBlockResult {
  message: string;
  fieldId: string;
}

const DEFAULT_LOGIC_BLOCK_MESSAGE =
  "⚠️ You must fulfill all requirements before submitting.";

function validateLogicRuleCondition(
  conditionSource: unknown,
  rule: Record<string, unknown>,
  responses: InductionFormAnswers
): LogicRuleBlockResult | null {
  const source =
    conditionSource && typeof conditionSource === "object"
      ? (conditionSource as Record<string, unknown>)
      : rule;

  const fieldId = String(source.field ?? rule.field ?? rule.field_id ?? "").trim();
  const expectedValue = "equals" in source ? source.equals : rule.trigger_value;

  if (!fieldId || expectedValue === undefined) return null;

  const userAnswer = responses[fieldId];
  if (userAnswer === undefined) return null;

  if (!answerMatchesExpected(userAnswer, expectedValue)) return null;

  const message = String(rule.message ?? "").trim() || DEFAULT_LOGIC_BLOCK_MESSAGE;
  return { message, fieldId };
}

/** Returns the first blocking logic rule match, supporting legacy and normalized rule shapes. */
export function validateLogicRules(
  rules: unknown[],
  responses: InductionFormAnswers
): LogicRuleBlockResult | null {
  for (const rawRule of rules) {
    if (!rawRule || typeof rawRule !== "object") continue;
    const rule = rawRule as Record<string, unknown>;

    const action = String(rule.action ?? "block_submission").trim();
    if (action !== "block_submission") continue;

    const when = rule.when;
    if (when && typeof when === "object" && Array.isArray((when as { or?: unknown }).or)) {
      for (const entry of (when as { or: unknown[] }).or) {
        const result = validateLogicRuleCondition(entry, rule, responses);
        if (result) return result;
      }
      continue;
    }

    const result = validateLogicRuleCondition(when ?? rule, rule, responses);
    if (result) return result;
  }

  return null;
}

export function evaluateLogicCondition(
  condition: InductionFormLogicCondition,
  answers: InductionFormAnswers
): boolean {
  const value = answers[condition.field];

  if ("equals" in condition) {
    return answerMatchesExpected(value, condition.equals);
  }
  if ("not_equals" in condition) {
    return !answerMatchesExpected(value, condition.not_equals);
  }

  return Boolean(value);
}

export function evaluateLogicWhen(
  when: InductionFormLogicWhen,
  answers: InductionFormAnswers
): boolean {
  if ("or" in when && Array.isArray(when.or)) {
    return when.or.some((condition) => evaluateLogicCondition(condition, answers));
  }

  return evaluateLogicCondition(when as InductionFormLogicCondition, answers);
}

export interface BlockSubmissionState {
  blocked: boolean;
  messages: string[];
}

export function evaluateBlockSubmissionRules(
  rules: InductionFormLogicRule[],
  answers: InductionFormAnswers
): BlockSubmissionState {
  const activeRules = rules.filter(
    (rule) =>
      rule.action === "block_submission" && evaluateLogicWhen(rule.when, answers)
  );

  const messages = activeRules
    .map((rule) => rule.message?.trim())
    .filter((message): message is string => Boolean(message));

  return {
    blocked: activeRules.length > 0,
    messages:
      messages.length > 0
        ? messages
        : activeRules.length > 0
          ? ["Submission is blocked based on your answers. Please review the form."]
          : [],
  };
}
