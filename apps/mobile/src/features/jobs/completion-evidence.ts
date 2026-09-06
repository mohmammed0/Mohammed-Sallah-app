import { z } from 'zod';

export const completionEvidenceManifestSchema = z
  .object({
    completionAttemptId: z.uuid(),
    attemptNumber: z.number().int().positive(),
    proofs: z
      .array(
        z.object({
          id: z.uuid(),
          uploadId: z.uuid(),
          mimeType: z.string(),
          description: z.string().nullable(),
          completionAttemptId: z.uuid(),
          attemptNumber: z.number().int().positive(),
        }),
      )
      .min(1),
  })
  .refine(
    (manifest) =>
      manifest.proofs.every(
        (proof) =>
          proof.completionAttemptId === manifest.completionAttemptId &&
          proof.attemptNumber === manifest.attemptNumber,
      ),
    'PROOF_ATTEMPT_MISMATCH',
  );

export type CompletionEvidenceBatch = z.infer<typeof completionEvidenceManifestSchema> & {
  jobId: string;
  jobVersion: number;
  loadId: number;
  urls: Readonly<Record<string, string>>;
  viewed: Readonly<Record<string, boolean>>;
};

type EvidenceJob = { id: string; version: number; status: string };

export function isCurrentCompletionEvidence(
  batch: CompletionEvidenceBatch | undefined,
  job: EvidenceJob | undefined,
): batch is CompletionEvidenceBatch {
  return Boolean(
    batch &&
    job &&
    job.status === 'completion_submitted' &&
    batch.jobId === job.id &&
    batch.jobVersion === job.version,
  );
}

export function canAcceptCompletionEvidence(
  batch: CompletionEvidenceBatch | undefined,
  job: EvidenceJob | undefined,
): boolean {
  return (
    isCurrentCompletionEvidence(batch, job) &&
    allCompletionEvidenceViewed(
      batch.proofs.map((proof) => proof.id),
      batch.viewed,
    )
  );
}

export function allCompletionEvidenceViewed(
  proofIds: readonly string[],
  viewed: Readonly<Record<string, boolean>>,
): boolean {
  return proofIds.length > 0 && proofIds.every((proofId) => viewed[proofId] === true);
}
