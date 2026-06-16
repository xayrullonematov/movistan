/**
 * OutputValidator — Validates structured LLM outputs against Zod schemas.
 *
 * Implements the OutputValidator interface from @/types/domain.
 * Each method:
 *   1. Attempts JSON.parse on the raw string
 *   2. Validates the parsed object against the corresponding Zod schema
 *   3. Returns a typed ValidationResult<T>
 */

import type {
  AgentType,
  ConsensusOutput,
  CritiqueOutput,
  OutputValidator as IOutputValidator,
  ProposalOutput,
  RevisionOutput,
  ValidationResult,
} from "@/types/domain";

import { proposalOutputSchema } from "@/schemas/proposal-output";
import { critiqueOutputSchema } from "@/schemas/critique-output";
import { revisionOutputSchema } from "@/schemas/revision-output";
import { consensusOutputSchema } from "@/schemas/consensus-output";
import type { ZodError } from "zod";


// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Attempts to parse a raw string as JSON.
 */
function tryParseJson(
  raw: string
): { success: true; data: unknown } | { success: false; error: string } {
  try {
    const data = JSON.parse(raw);
    return { success: true, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown parse error";
    return { success: false, error: `Invalid JSON: ${message}` };
  }
}

/**
 * Extracts human-readable error messages from a ZodError.
 */
function extractZodErrors(error: ZodError<unknown>): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}


/**
 * Formats validation errors into a single string for re-prompting the LLM.
 */
export function buildValidationErrorMessage(errors: string[]): string {
  const header = "Your previous response was invalid. Please fix:";
  const items = errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n");
  const footer =
    "Return ONLY valid JSON matching the schema. No markdown fences, no explanatory text.";
  return `${header}\n${items}\n\n${footer}`;
}


// =============================================================================
// OUTPUT VALIDATOR IMPLEMENTATION
// =============================================================================

export class OutputValidatorImpl implements IOutputValidator {
  /**
   * Validates raw LLM output as a ProposalOutput.
   */
  validateProposal(raw: string): ValidationResult<ProposalOutput> {
    const parseResult = tryParseJson(raw);
    if (!parseResult.success) {
      return { success: false, errors: [parseResult.error], raw };
    }

    const zodResult = proposalOutputSchema.safeParse(parseResult.data);
    if (!zodResult.success) {
      return {
        success: false,
        errors: extractZodErrors(zodResult.error),
        raw,
      };
    }

    return { success: true, data: zodResult.data as ProposalOutput };
  }


  /**
   * Validates raw LLM output as a CritiqueOutput.
   * Additionally verifies that targetAgentId is not the critiquing agent's own ID.
   */
  validateCritique(raw: string, critiquerAgentId?: AgentType): ValidationResult<CritiqueOutput> {
    const parseResult = tryParseJson(raw);
    if (!parseResult.success) {
      return { success: false, errors: [parseResult.error], raw };
    }

    const zodResult = critiqueOutputSchema.safeParse(parseResult.data);
    if (!zodResult.success) {
      return {
        success: false,
        errors: extractZodErrors(zodResult.error),
        raw,
      };
    }

    const data = zodResult.data as CritiqueOutput;
    if (critiquerAgentId && data.targetAgentId === critiquerAgentId) {
      return {
        success: false,
        errors: [`targetAgentId: Critique target cannot be yourself (${critiquerAgentId})`],
        raw,
      };
    }

    return { success: true, data };
  }


  /**
   * Validates raw LLM output as a RevisionOutput.
   * The schema's .refine() handles partially-concede validation.
   */
  validateRevision(raw: string): ValidationResult<RevisionOutput> {
    const parseResult = tryParseJson(raw);
    if (!parseResult.success) {
      return { success: false, errors: [parseResult.error], raw };
    }

    const zodResult = revisionOutputSchema.safeParse(parseResult.data);
    if (!zodResult.success) {
      return {
        success: false,
        errors: extractZodErrors(zodResult.error),
        raw,
      };
    }

    return { success: true, data: zodResult.data as RevisionOutput };
  }


  /**
   * Validates raw LLM output as a ConsensusOutput.
   */
  validateConsensus(raw: string): ValidationResult<ConsensusOutput> {
    const parseResult = tryParseJson(raw);
    if (!parseResult.success) {
      return { success: false, errors: [parseResult.error], raw };
    }

    const zodResult = consensusOutputSchema.safeParse(parseResult.data);
    if (!zodResult.success) {
      return {
        success: false,
        errors: extractZodErrors(zodResult.error),
        raw,
      };
    }

    return { success: true, data: zodResult.data as ConsensusOutput };
  }
}
