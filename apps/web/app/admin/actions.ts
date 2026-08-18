'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin, requireAnyAdmin } from '@/lib/auth';
import { adminCommandKey } from '@/lib/admin-command-intent';

function commandIntentId(formData: FormData): string {
  return z.uuid().parse(formData.get('commandIntentId'));
}
function formCommandKey(scope: string, formData: FormData, payload: unknown): string {
  return adminCommandKey(scope, commandIntentId(formData), payload);
}

const providerDecision = z.object({
  providerId: z.uuid(),
  decision: z.enum(['verified', 'rejected', 'more_information_required', 'suspended']),
  reason: z.string().trim().min(5).max(1000),
});
const providerServiceDecision = z.object({
  providerId: z.uuid(),
  categoryId: z.uuid(),
  decision: z.enum(['approved', 'more_information_required', 'rejected', 'suspended']),
  reason: z.string().trim().min(5).max(2000),
});
const categoryDecision = z.object({
  categoryId: z.uuid(),
  enabled: z.enum(['true', 'false']).transform((value) => value === 'true'),
  reason: z.string().trim().min(5).max(1000),
});
const customerStatusDecision = z.object({
  customerId: z.uuid(),
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().min(5).max(1000),
});
const cancellationDecision = z.object({
  cancellationId: z.uuid(),
  approve: z.enum(['true', 'false']).transform((value) => value === 'true'),
  feeMinor: z.coerce.number().int().min(0).max(100_000_000),
  reason: z.string().trim().min(5).max(1000),
  expectedJobVersion: z.coerce.number().int().positive(),
});
const disputeDecision = z.object({
  disputeId: z.uuid(),
  action: z.enum(['no_financial_action', 'release_to_provider', 'refund_customer', 'split']),
  amountMinor: z.coerce.number().int().min(0).max(100_000_000),
  jobOutcome: z.enum(['resume', 'complete', 'cancel', 'close_no_further_work']),
  reason: z.string().trim().min(5).max(2000),
  expectedJobVersion: z.coerce.number().int().positive(),
});
const financialActionConfirmation = z.object({
  intentId: z.uuid(),
  providerReference: z.string().trim().min(3).max(200),
  reason: z.string().trim().min(5).max(1000),
});
const supportAssignment = z.object({
  caseId: z.uuid(),
  assigneeId: z.uuid(),
  reason: z.string().trim().min(5).max(1000),
  expiresAt: z.string().datetime(),
  exactLocation: z.boolean(),
});
const supportAssignmentEnd = z.object({
  assignmentId: z.uuid(),
  reason: z.string().trim().min(5).max(1000),
});
const supportGrant = z.object({
  caseId: z.uuid(),
  userId: z.uuid(),
  reason: z.string().trim().min(5).max(1000),
  expiresAt: z.string().datetime(),
  exactLocation: z.boolean(),
});
const supportGrantRevoke = z.object({
  grantId: z.uuid(),
  reason: z.string().trim().min(5).max(1000),
});

export async function reviewProvider(formData: FormData): Promise<void> {
  const input = providerDecision.parse({
    providerId: formData.get('providerId'),
    decision: formData.get('decision'),
    reason: formData.get('reason'),
  });
  const { client } = await requireAdmin(['provider.document.read']);
  const { error } = await client.rpc('review_provider', {
    p_provider_id: input.providerId,
    p_decision: input.decision,
    p_reason: input.reason,
    p_idempotency_key: formCommandKey('provider-review', formData, input),
  });
  if (error) throw new Error('PROVIDER_REVIEW_FAILED');
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
}

export async function reviewProviderService(formData: FormData): Promise<void> {
  const input = providerServiceDecision.parse({
    providerId: formData.get('providerId'),
    categoryId: formData.get('categoryId'),
    decision: formData.get('decision'),
    reason: formData.get('reason'),
  });
  const { client } = await requireAdmin(['provider.document.read']);
  const { error } = await client.rpc('review_provider_service', {
    p_provider_id: input.providerId,
    p_category_id: input.categoryId,
    p_decision: input.decision,
    p_reason: input.reason,
    p_idempotency_key: formCommandKey('provider-service-review', formData, input),
  });
  if (error) throw new Error('PROVIDER_SERVICE_REVIEW_FAILED');
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
}

export async function setCategoryState(formData: FormData): Promise<void> {
  const input = categoryDecision.parse({
    categoryId: formData.get('categoryId'),
    enabled: formData.get('enabled'),
    reason: formData.get('reason'),
  });
  const { client } = await requireAdmin(['operations.mutate']);
  const { error } = await client.rpc('admin_set_category', {
    p_category_id: input.categoryId,
    p_enabled: input.enabled,
    p_reason: input.reason,
    p_idempotency_key: formCommandKey('category-state', formData, input),
  });
  if (error) throw new Error('CATEGORY_UPDATE_FAILED');
  revalidatePath('/admin/catalog');
  revalidatePath('/admin');
}

export async function setCustomerStatus(formData: FormData): Promise<void> {
  const input = customerStatusDecision.parse({
    customerId: formData.get('customerId'),
    status: formData.get('status'),
    reason: formData.get('reason'),
  });
  const { client } = await requireAdmin(['operations.mutate']);
  const { error } = await client.rpc('admin_set_customer_status', {
    p_customer_id: input.customerId,
    p_status: input.status,
    p_reason: input.reason,
    p_idempotency_key: formCommandKey('customer-status', formData, input),
  });
  if (error) throw new Error('CUSTOMER_STATUS_UPDATE_FAILED');
  revalidatePath('/admin/customers');
  revalidatePath('/admin');
}

export async function decideCancellation(formData: FormData): Promise<void> {
  const input = cancellationDecision.parse({
    cancellationId: formData.get('cancellationId'),
    approve: formData.get('approve'),
    feeMinor: formData.get('feeMinor'),
    reason: formData.get('reason'),
    expectedJobVersion: formData.get('expectedJobVersion'),
  });
  const { client } = await requireAnyAdmin([
    'support.case.read',
    'operations.marketplace.read',
    'finance.read',
  ]);
  const { error } = await client.rpc('decide_cancellation', {
    p_cancellation_id: input.cancellationId,
    p_approve: input.approve,
    p_fee_minor: input.feeMinor,
    p_reason: input.reason,
    p_expected_job_version: input.expectedJobVersion,
    p_idempotency_key: formCommandKey('cancellation-decision', formData, input),
  });
  if (error) throw new Error('CANCELLATION_DECISION_FAILED');
  revalidatePath('/admin/support');
  revalidatePath('/admin/finance');
  revalidatePath('/admin/jobs');
  revalidatePath('/admin');
}

export async function resolveDispute(formData: FormData): Promise<void> {
  const input = disputeDecision.parse({
    disputeId: formData.get('disputeId'),
    action: formData.get('action'),
    amountMinor: formData.get('amountMinor'),
    jobOutcome: formData.get('jobOutcome'),
    reason: formData.get('reason'),
    expectedJobVersion: formData.get('expectedJobVersion'),
  });
  const { client } = await requireAnyAdmin([
    'support.case.read',
    'operations.marketplace.read',
    'finance.read',
  ]);
  const { error } = await client.rpc('resolve_dispute', {
    p_dispute_id: input.disputeId,
    p_action: input.action,
    p_amount_minor: input.amountMinor,
    p_job_outcome: input.jobOutcome,
    p_reason: input.reason,
    p_expected_job_version: input.expectedJobVersion,
    p_idempotency_key: formCommandKey('dispute-resolution', formData, input),
  });
  if (error) {
    console.error('DISPUTE_RESOLUTION_FAILED', { code: error.code, message: error.message });
    throw new Error('DISPUTE_RESOLUTION_FAILED');
  }
  revalidatePath('/admin/support');
  revalidatePath('/admin/finance');
  revalidatePath('/admin/jobs');
  revalidatePath('/admin');
}

export async function confirmFinancialAction(formData: FormData): Promise<void> {
  const input = financialActionConfirmation.parse({
    intentId: formData.get('intentId'),
    providerReference: formData.get('providerReference'),
    reason: formData.get('reason'),
  });
  const { client } = await requireAdmin(['finance.read']);
  const { error } = await client.rpc('confirm_financial_action', {
    p_intent_id: input.intentId,
    p_provider_reference: input.providerReference,
    p_reason: input.reason,
    p_idempotency_key: formCommandKey('financial-confirmation', formData, input),
  });
  if (error) throw new Error('FINANCIAL_ACTION_CONFIRMATION_FAILED');
  revalidatePath('/admin/support');
  revalidatePath('/admin/finance');
  revalidatePath('/admin/jobs');
  revalidatePath('/admin');
}

export async function assignSupportCase(formData: FormData): Promise<void> {
  const input = supportAssignment.parse({
    caseId: formData.get('caseId'),
    assigneeId: formData.get('assigneeId'),
    reason: formData.get('reason'),
    expiresAt: formData.get('expiresAt') || formData.get('normalizedExpiresAt') || null,
    exactLocation: formData.get('exactLocation') === 'true',
  });
  const { client } = await requireAdmin(['operations.mutate']);
  const permissions = ['read', 'internal_note', 'evidence'];
  if (input.exactLocation) permissions.push('exact_location');
  const commandPayload = { ...input, expiresAt: input.expiresAt };
  const { error } = await client.rpc('assign_support_case', {
    p_case_id: input.caseId,
    p_assignee_id: input.assigneeId,
    p_permissions: permissions,
    p_reason: input.reason,
    p_expires_at: input.expiresAt,
    p_idempotency_key: formCommandKey('support-assignment', formData, commandPayload),
  });
  if (error) throw new Error('SUPPORT_ASSIGNMENT_FAILED');
  revalidatePath('/admin/support');
}

export async function endSupportAssignment(formData: FormData): Promise<void> {
  const input = supportAssignmentEnd.parse({
    assignmentId: formData.get('assignmentId'),
    reason: formData.get('reason'),
  });
  const { client } = await requireAdmin(['operations.mutate']);
  const { error } = await client.rpc('end_support_case_assignment', {
    p_assignment_id: input.assignmentId,
    p_reason: input.reason,
    p_idempotency_key: formCommandKey('support-assignment-end', formData, input),
  });
  if (error) throw new Error('SUPPORT_ASSIGNMENT_END_FAILED');
  revalidatePath('/admin/support');
}

export async function grantSupportAccess(formData: FormData): Promise<void> {
  const input = supportGrant.parse({
    caseId: formData.get('caseId'),
    userId: formData.get('userId'),
    reason: formData.get('reason'),
    expiresAt: formData.get('expiresAt'),
    exactLocation: formData.get('exactLocation') === 'true',
  });
  const { client } = await requireAdmin(['operations.mutate']);
  const permissions = ['read', 'internal_note', 'evidence'];
  if (input.exactLocation) permissions.push('exact_location');
  const { error } = await client.rpc('grant_support_case_access', {
    p_case_id: input.caseId,
    p_user_id: input.userId,
    p_access_type: 'temporary',
    p_permissions: permissions,
    p_reason: input.reason,
    p_expires_at: input.expiresAt,
    p_idempotency_key: formCommandKey('support-access-grant', formData, input),
  });
  if (error) throw new Error('SUPPORT_ACCESS_GRANT_FAILED');
  revalidatePath('/admin/support');
}

export async function revokeSupportAccess(formData: FormData): Promise<void> {
  const input = supportGrantRevoke.parse({
    grantId: formData.get('grantId'),
    reason: formData.get('reason'),
  });
  const { client } = await requireAdmin(['operations.mutate']);
  const { error } = await client.rpc('revoke_support_case_access', {
    p_grant_id: input.grantId,
    p_reason: input.reason,
    p_idempotency_key: formCommandKey('support-access-revoke', formData, input),
  });
  if (error) throw new Error('SUPPORT_ACCESS_REVOKE_FAILED');
  revalidatePath('/admin/support');
}
