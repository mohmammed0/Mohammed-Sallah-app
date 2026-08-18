export function allCompletionEvidenceViewed(
  proofIds: readonly string[],
  viewed: Readonly<Record<string, boolean>>,
): boolean {
  return proofIds.length > 0 && proofIds.every((proofId) => viewed[proofId] === true);
}
