'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';

const providerDecision = z.object({
  providerId: z.uuid(),
  decision: z.enum(['verified', 'rejected', 'more_information_required', 'suspended']),
  reason: z.string().trim().min(5).max(1000),
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

export async function reviewProvider(formData: FormData): Promise<void> {
  const input = providerDecision.parse({
    providerId: formData.get('providerId'),
    decision: formData.get('decision'),
    reason: formData.get('reason'),
  });
  const { client } = await requireAdmin(['verification_reviewer', 'super_admin']);
  const { error } = await client.rpc('review_provider', {
    p_provider_id: input.providerId,
    p_decision: input.decision,
    p_reason: input.reason,
    p_idempotency_key: globalThis.crypto.randomUUID(),
  });
  if (error) throw new Error('PROVIDER_REVIEW_FAILED');
  revalidatePath('/admin/providers');
  revalidatePath('/admin');
}

export async function setCategoryState(formData: FormData): Promise<void> {
  const input = categoryDecision.parse({
    categoryId: formData.get('categoryId'),
    enabled: formData.get('enabled'),
    reason: formData.get('reason'),
  });
  const { client } = await requireAdmin(['operations_admin', 'super_admin']);
  const { error } = await client.rpc('admin_set_category', {
    p_category_id: input.categoryId,
    p_enabled: input.enabled,
    p_reason: input.reason,
    p_idempotency_key: globalThis.crypto.randomUUID(),
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
  const { client } = await requireAdmin(['operations_admin', 'super_admin']);
  const { error } = await client.rpc('admin_set_customer_status', {
    p_customer_id: input.customerId,
    p_status: input.status,
    p_reason: input.reason,
    p_idempotency_key: globalThis.crypto.randomUUID(),
  });
  if (error) throw new Error('CUSTOMER_STATUS_UPDATE_FAILED');
  revalidatePath('/admin/customers');
  revalidatePath('/admin');
}
