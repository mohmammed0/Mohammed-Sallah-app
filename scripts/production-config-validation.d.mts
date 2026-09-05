export const productionRequiredKeys: readonly string[];

export type ProductionValidationResult =
  { ok: true; message: string } | { ok: false; message: string };

export function validateProductionConfiguration(
  environment: Record<string, string | undefined>,
): ProductionValidationResult;
