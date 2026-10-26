import { z } from "zod";
import { isSilicaOptionalForWorker } from "@/lib/silica-onboarding";
import { normalizeWorkerStateRegion } from "@/lib/worker-state-region";

const complianceContextSchema = z.object({
  organisationId: z.string().nullable().optional(),
  organisationName: z.string().nullable().optional(),
  subcontractorId: z.string().nullable().optional(),
  subcontractorName: z.string().nullable().optional(),
  isSubcontractor: z.boolean().nullable().optional(),
});

/**
 * Full worker self-onboarding compliance.
 * White Card is always required. Silica is required unless the organisation
 * or subcontractor is A Plus.
 */
export const workerOnboardingComplianceSchema = z
  .object({
    whiteCardNumber: z.string(),
    whiteCardState: z.string(),
    silicaCertNumber: z.string(),
    silicaCertIssueDate: z.string(),
  })
  .and(complianceContextSchema)
  .superRefine((value, ctx) => {
    if (!value.whiteCardNumber.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["whiteCardNumber"],
        message: "White card number is required.",
      });
    }
    if (!normalizeWorkerStateRegion(value.whiteCardState)) {
      ctx.addIssue({
        code: "custom",
        path: ["whiteCardState"],
        message: "White card state / region is required.",
      });
    }

    if (
      isSilicaOptionalForWorker({
        organisationId: value.organisationId,
        organisationName: value.organisationName,
        subcontractorId: value.subcontractorId,
        subcontractorName: value.subcontractorName,
        isSubcontractor: value.isSubcontractor,
      })
    ) {
      return;
    }

    if (!value.silicaCertNumber.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["silicaCertNumber"],
        message: "Silica awareness certificate number is required.",
      });
    }
    if (!value.silicaCertIssueDate.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["silicaCertIssueDate"],
        message: "Silica awareness issue date is required.",
      });
    }
  });

/** Admin and bulk onboarding collect a white card number and issue date. */
export const workerOnboardingTicketSchema = z
  .object({
    whiteCardNumber: z.string(),
    whiteCardIssueDate: z.string(),
    silicaCertNumber: z.string(),
    silicaCertIssueDate: z.string(),
  })
  .and(complianceContextSchema)
  .superRefine((value, ctx) => {
    if (!value.whiteCardNumber.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["whiteCardNumber"],
        message: "White card number is required.",
      });
    }
    if (!value.whiteCardIssueDate.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["whiteCardIssueDate"],
        message: "White card issue date is required.",
      });
    }

    if (
      isSilicaOptionalForWorker({
        organisationId: value.organisationId,
        organisationName: value.organisationName,
        subcontractorId: value.subcontractorId,
        subcontractorName: value.subcontractorName,
        isSubcontractor: value.isSubcontractor,
      })
    ) {
      return;
    }

    if (!value.silicaCertNumber.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["silicaCertNumber"],
        message: "Silica awareness certificate number is required.",
      });
    }
    if (!value.silicaCertIssueDate.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["silicaCertIssueDate"],
        message: "Silica awareness issue date is required.",
      });
    }
  });

export function firstWorkerValidationMessage(
  error: z.ZodError
): string {
  return error.issues[0]?.message ?? "Invalid worker compliance details.";
}
