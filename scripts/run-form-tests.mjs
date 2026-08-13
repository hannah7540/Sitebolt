import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function summarizeSubmission(results) {
  return {
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    total: results.length,
    failures: results
      .filter((r) => r.status === "failed")
      .map((r) => ({
        id: r.id,
        label: r.label,
        error: r.errorMessage ?? r.errorCode,
      })),
  };
}

function summarizeE2E(results) {
  return {
    mapped: results.filter((r) => r.mappedCorrectly).length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    total: results.length,
    failures: results
      .filter((r) => r.status === "failed" || !r.mappedCorrectly)
      .map((r) => ({
        id: r.id,
        label: r.label,
        steps: r.steps.filter((s) => s.status === "failed").map((s) => s.message),
      })),
  };
}

function summarizeActions(results) {
  return {
    passed: results.filter((r) => r.actionPassed).length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    total: results.length,
    failures: results
      .filter((r) => !r.actionPassed && r.status === "failed")
      .map((r) => ({
        id: r.id,
        module: r.module,
        buttonLabel: r.buttonLabel,
        steps: r.steps.filter((s) => s.status === "failed").map((s) => s.message),
      })),
  };
}

loadEnvLocal();

const { runAllFormSubmissionTests } = await import("../src/lib/form-submission-tester.ts");
const { runRegisterE2EVerificationTests } = await import("../src/lib/register-e2e-tester.ts");
const { runActionWorkflowTests } = await import("../src/lib/action-workflow-tester.ts");

console.log("=== Form Submission Test Console — Run All Tests ===\n");

const submission = await runAllFormSubmissionTests();
console.log("1) SQL Submission Tests");
if (submission.error) console.log(`Fatal: ${submission.error}`);
const submissionSummary = summarizeSubmission(submission.results);
console.log(
  `   ${submissionSummary.passed} passed · ${submissionSummary.failed} failed · ${submissionSummary.skipped} skipped · ${submissionSummary.total} total`
);
if (submissionSummary.failures.length > 0) {
  for (const failure of submissionSummary.failures) {
    console.log(`   ✗ ${failure.label}: ${failure.error ?? "failed"}`);
  }
}

const e2e = await runRegisterE2EVerificationTests();
console.log("\n2) Verify Register Flow & Mapping");
if (e2e.error) console.log(`Fatal: ${e2e.error}`);
const e2eSummary = summarizeE2E(e2e.results);
console.log(
  `   ${e2eSummary.mapped} mapped · ${e2eSummary.failed} failed · ${e2eSummary.skipped} skipped · ${e2eSummary.total} total`
);
if (e2eSummary.failures.length > 0) {
  for (const failure of e2eSummary.failures) {
    console.log(`   ✗ ${failure.label}`);
    for (const step of failure.steps) {
      if (step) console.log(`     - ${step}`);
    }
  }
}

const actions = await runActionWorkflowTests();
console.log("\n3) Full System Button Actions Diagnostic");
if (actions.error) console.log(`Fatal: ${actions.error}`);
const actionSummary = summarizeActions(actions.results);
console.log(
  `   ${actionSummary.passed} passed · ${actionSummary.failed} failed · ${actionSummary.skipped} skipped · ${actionSummary.total} total`
);
if (actionSummary.failures.length > 0) {
  for (const failure of actionSummary.failures) {
    console.log(`   ✗ ${failure.module} / ${failure.buttonLabel}`);
    for (const step of failure.steps) {
      if (step) console.log(`     - ${step}`);
    }
  }
}

const allFatal = submission.error || e2e.error || actions.error;
const allPassed =
  !allFatal &&
  submissionSummary.failed === 0 &&
  e2eSummary.failed === 0 &&
  actionSummary.failed === 0;

console.log(`\n=== Overall: ${allPassed ? "ALL PASSED" : "SOME FAILURES"} ===`);
process.exit(allPassed ? 0 : 1);
