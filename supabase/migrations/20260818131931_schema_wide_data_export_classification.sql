begin;

create table public.data_export_table_classifications (
  table_name text primary key,
  classification text not null check(classification in (
    'exported','exported_with_redaction','internal_security_only',
    'operational_only','not_user_related'
  )),
  reason text not null check(length(trim(reason))>=10),
  manifest_categories text[] not null default '{}',
  query_anchors text[] not null default '{}',
  check(
    (classification in ('exported','exported_with_redaction')
      and cardinality(manifest_categories)>0 and cardinality(query_anchors)>0)
    or
    (classification not in ('exported','exported_with_redaction')
      and cardinality(manifest_categories)=0 and cardinality(query_anchors)=0)
  )
);
alter table public.data_export_table_classifications enable row level security;
revoke all on public.data_export_table_classifications from public,anon,authenticated;
grant select on public.data_export_table_classifications to service_role;

alter function public.get_data_export_manifest() rename to get_data_export_manifest_v3;
alter function public.get_data_export_query_coverage() rename to get_data_export_query_coverage_v3;
alter function public.build_data_export(uuid,uuid) rename to build_data_export_v3;

create function public.get_data_export_manifest() returns jsonb
language sql immutable security definer set search_path='' as $$
  select public.get_data_export_manifest_v3() || '[
    "blockedUsers","providerQualifications","providerQualificationHistory",
    "providerDocumentReviews","providerStatusHistory","providerSuspensions",
    "offerRevisions","offerStatusHistory","offerWithdrawals",
    "changeOrders","changeOrderItems","jobAssignments","jobChecklists","jobNotes",
    "completionAttempts","acceptanceEvidence","messageReadReceipts",
    "messageTranslations","messageModeration","paymentAttempts","paymentEvents",
    "providerSettlements","settlementEvents","platformFees","financialActionIntents"
  ]'::jsonb
$$;

create function public.get_data_export_query_coverage() returns jsonb
language sql immutable security definer set search_path='' as $$
  select public.get_data_export_query_coverage_v3() || jsonb_build_object(
    'blockedUsers','blocked_users blocked_export',
    'providerQualifications','provider_restricted_qualifications qualifications_export',
    'providerQualificationHistory','provider_qualification_events qualification_events_export',
    'providerDocumentReviews','provider_document_reviews document_reviews_export',
    'providerStatusHistory','provider_status_history provider_history_export',
    'providerSuspensions','provider_suspensions suspensions_export',
    'offerRevisions','offer_revisions revisions_export',
    'offerStatusHistory','offer_status_history offer_history_export',
    'offerWithdrawals','offer_withdrawals withdrawals_export',
    'changeOrders','change_orders change_orders_export',
    'changeOrderItems','change_order_items change_items_export',
    'jobAssignments','job_assignments assignments_export',
    'jobChecklists','job_checklists checklists_export',
    'jobNotes','job_notes notes_export',
    'completionAttempts','completion_attempts attempts_export',
    'acceptanceEvidence','customer_acceptance_evidence acceptance_evidence_export',
    'messageReadReceipts','message_read_receipts read_receipts_export',
    'messageTranslations','message_translations message_translations_export',
    'messageModeration','message_moderation_events moderation_export',
    'paymentAttempts','payment_attempts payment_attempts_export',
    'paymentEvents','payment_events payment_events_export',
    'providerSettlements','provider_settlements settlements_export',
    'settlementEvents','settlement_events settlement_events_export',
    'platformFees','platform_fees fees_export',
    'financialActionIntents','financial_action_intents intents_export'
  )
$$;

create function public.build_data_export(p_request_id uuid,p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare base jsonb;
begin
  base:=public.build_data_export_v3(p_request_id,p_user_id);
  return base || jsonb_build_object(
    'schemaVersion','4',
    'manifest',public.get_data_export_manifest(),
    'queryCoverage',public.get_data_export_query_coverage(),
    'blockedUsers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'relationship',case when blocked_export.blocker_id=p_user_id then 'blocked_by_self' else 'blocked_self' end,
        'reason',case when blocked_export.blocker_id=p_user_id then blocked_export.reason else null end,
        'createdAt',blocked_export.created_at
      ) order by blocked_export.created_at)
      from public.blocked_users blocked_export
      where p_user_id in (blocked_export.blocker_id,blocked_export.blocked_id)
    ),'[]'::jsonb),
    'providerQualifications',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',qualifications_export.id,'categoryId',qualifications_export.category_id,
        'subcategoryId',qualifications_export.subcategory_id,
        'qualified',qualifications_export.qualified,'reason',qualifications_export.reason,
        'reviewedAt',qualifications_export.reviewed_at,'updatedAt',qualifications_export.updated_at,
        'reviewerIdentity','redacted'
      ) order by qualifications_export.updated_at)
      from public.provider_restricted_qualifications qualifications_export
      where qualifications_export.provider_id=p_user_id
    ),'[]'::jsonb),
    'providerQualificationHistory',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',qualification_events_export.id,
        'qualificationId',qualification_events_export.qualification_id,
        'categoryId',qualification_events_export.category_id,
        'subcategoryId',qualification_events_export.subcategory_id,
        'eventType',qualification_events_export.event_type,
        'reason',qualification_events_export.reason,
        'createdAt',qualification_events_export.created_at,
        'reviewerIdentity','redacted'
      ) order by qualification_events_export.created_at)
      from public.provider_qualification_events qualification_events_export
      where qualification_events_export.provider_id=p_user_id
    ),'[]'::jsonb),
    'providerDocumentReviews',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',document_reviews_export.id,'documentId',document_reviews_export.document_id,
        'decision',document_reviews_export.decision,'reason',document_reviews_export.reason,
        'createdAt',document_reviews_export.created_at,'reviewerIdentity','redacted'
      ) order by document_reviews_export.created_at)
      from public.provider_document_reviews document_reviews_export
      join public.provider_documents pd_export on pd_export.id=document_reviews_export.document_id
      where pd_export.provider_id=p_user_id
    ),'[]'::jsonb),
    'providerStatusHistory',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',provider_history_export.id,'previousStatus',provider_history_export.previous_status,
        'newStatus',provider_history_export.new_status,'reason',provider_history_export.reason,
        'createdAt',provider_history_export.created_at,'reviewerIdentity','redacted'
      ) order by provider_history_export.created_at)
      from public.provider_status_history provider_history_export
      where provider_history_export.provider_id=p_user_id
    ),'[]'::jsonb),
    'providerSuspensions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',suspensions_export.id,'reason',suspensions_export.reason,
        'startsAt',suspensions_export.starts_at,'endsAt',suspensions_export.ends_at,
        'liftedAt',suspensions_export.lifted_at,'staffIdentity','redacted'
      ) order by suspensions_export.starts_at)
      from public.provider_suspensions suspensions_export
      where suspensions_export.provider_id=p_user_id
    ),'[]'::jsonb),
    'offerRevisions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',revisions_export.id,'offerId',revisions_export.offer_id,
        'revision',revisions_export.revision,'snapshot',revisions_export.snapshot,
        'actorReference',case when revisions_export.actor_id=p_user_id then 'self' else 'counterparty_or_system' end,
        'reason',revisions_export.reason,'createdAt',revisions_export.created_at
      ) order by revisions_export.created_at)
      from public.offer_revisions revisions_export
      join public.offers o_revision on o_revision.id=revisions_export.offer_id
      join public.service_requests r_revision on r_revision.id=o_revision.request_id
      where o_revision.provider_id=p_user_id or r_revision.customer_id=p_user_id
    ),'[]'::jsonb),
    'offerStatusHistory',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',offer_history_export.id,'offerId',offer_history_export.offer_id,
        'previousStatus',offer_history_export.previous_status,
        'newStatus',offer_history_export.new_status,
        'actorReference',case when offer_history_export.actor_id=p_user_id then 'self' else 'counterparty_or_system' end,
        'reason',offer_history_export.reason,'createdAt',offer_history_export.created_at
      ) order by offer_history_export.created_at)
      from public.offer_status_history offer_history_export
      join public.offers o_history on o_history.id=offer_history_export.offer_id
      join public.service_requests r_history on r_history.id=o_history.request_id
      where o_history.provider_id=p_user_id or r_history.customer_id=p_user_id
    ),'[]'::jsonb),
    'offerWithdrawals',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',withdrawals_export.id,'offerId',withdrawals_export.offer_id,
        'reason',withdrawals_export.reason,'createdAt',withdrawals_export.created_at
      ) order by withdrawals_export.created_at)
      from public.offer_withdrawals withdrawals_export
      join public.offers o_withdrawal on o_withdrawal.id=withdrawals_export.offer_id
      join public.service_requests r_withdrawal on r_withdrawal.id=o_withdrawal.request_id
      where withdrawals_export.provider_id=p_user_id or r_withdrawal.customer_id=p_user_id
    ),'[]'::jsonb),
    'changeOrders',coalesce((
      select jsonb_agg(to_jsonb(change_orders_export)-'idempotency_key' order by change_orders_export.created_at)
      from public.change_orders change_orders_export
      join public.jobs j_change on j_change.id=change_orders_export.job_id
      where p_user_id in (j_change.customer_id,j_change.provider_id)
    ),'[]'::jsonb),
    'changeOrderItems',coalesce((
      select jsonb_agg(to_jsonb(change_items_export))
      from public.change_order_items change_items_export
      join public.change_orders co_export on co_export.id=change_items_export.change_order_id
      join public.jobs j_change_item on j_change_item.id=co_export.job_id
      where p_user_id in (j_change_item.customer_id,j_change_item.provider_id)
    ),'[]'::jsonb),
    'jobAssignments',coalesce((
      select jsonb_agg(to_jsonb(assignments_export) order by assignments_export.assigned_at)
      from public.job_assignments assignments_export
      join public.jobs j_assignment on j_assignment.id=assignments_export.job_id
      where p_user_id in (j_assignment.customer_id,j_assignment.provider_id)
    ),'[]'::jsonb),
    'jobChecklists',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',checklists_export.id,'jobId',checklists_export.job_id,
        'itemKey',checklists_export.item_key,'label',checklists_export.label_snapshot,
        'required',checklists_export.required,'completed',checklists_export.completed_at is not null,
        'completedAt',checklists_export.completed_at,
        'completedByReference',case when checklists_export.completed_by=p_user_id then 'self'
          when checklists_export.completed_by is null then null else 'counterparty' end
      ))
      from public.job_checklists checklists_export
      join public.jobs j_checklist on j_checklist.id=checklists_export.job_id
      where p_user_id in (j_checklist.customer_id,j_checklist.provider_id)
    ),'[]'::jsonb),
    'jobNotes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',notes_export.id,'jobId',notes_export.job_id,
        'authorReference',case when notes_export.author_id=p_user_id then 'self' else 'counterparty' end,
        'body',notes_export.body,'visibility',notes_export.visibility,
        'createdAt',notes_export.created_at,'deletedAt',notes_export.deleted_at
      ) order by notes_export.created_at)
      from public.job_notes notes_export
      join public.jobs j_note on j_note.id=notes_export.job_id
      where p_user_id in (j_note.customer_id,j_note.provider_id)
        and (notes_export.visibility='participants' or notes_export.author_id=p_user_id)
    ),'[]'::jsonb),
    'completionAttempts',coalesce((
      select jsonb_agg(to_jsonb(attempts_export)-'idempotency_key' order by attempts_export.attempt_number)
      from public.completion_attempts attempts_export
      join public.jobs j_attempt on j_attempt.id=attempts_export.job_id
      where p_user_id in (j_attempt.customer_id,j_attempt.provider_id)
    ),'[]'::jsonb),
    'acceptanceEvidence',coalesce((
      select jsonb_agg(jsonb_build_object(
        'acceptanceId',acceptance_evidence_export.acceptance_id,
        'uploadId',acceptance_evidence_export.file_upload_id,
        'createdAt',acceptance_evidence_export.created_at
      ))
      from public.customer_acceptance_evidence acceptance_evidence_export
      join public.customer_acceptances ca_export on ca_export.id=acceptance_evidence_export.acceptance_id
      join public.jobs j_acceptance on j_acceptance.id=ca_export.job_id
      where p_user_id in (j_acceptance.customer_id,j_acceptance.provider_id)
    ),'[]'::jsonb),
    'messageReadReceipts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'messageId',read_receipts_export.message_id,
        'readerReference',case when read_receipts_export.user_id=p_user_id then 'self' else 'counterparty' end,
        'readAt',read_receipts_export.read_at
      ))
      from public.message_read_receipts read_receipts_export
      join public.messages m_receipt on m_receipt.id=read_receipts_export.message_id
      where exists(select 1 from public.conversation_members cm_receipt
        where cm_receipt.conversation_id=m_receipt.conversation_id and cm_receipt.user_id=p_user_id)
    ),'[]'::jsonb),
    'messageTranslations',coalesce((
      select jsonb_agg(to_jsonb(message_translations_export)-'translation_job_id')
      from public.message_translations message_translations_export
      join public.messages m_translation on m_translation.id=message_translations_export.message_id
      where exists(select 1 from public.conversation_members cm_translation
        where cm_translation.conversation_id=m_translation.conversation_id and cm_translation.user_id=p_user_id)
    ),'[]'::jsonb),
    'messageModeration',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',moderation_export.id,'messageId',moderation_export.message_id,
        'reporterReference',case when moderation_export.reporter_id=p_user_id then 'self' else 'redacted' end,
        'action',moderation_export.action,'reason',moderation_export.reason,
        'createdAt',moderation_export.created_at,'staffIdentity','redacted'
      ) order by moderation_export.created_at)
      from public.message_moderation_events moderation_export
      join public.messages m_moderation on m_moderation.id=moderation_export.message_id
      where moderation_export.reporter_id=p_user_id or m_moderation.sender_id=p_user_id
    ),'[]'::jsonb),
    'paymentAttempts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',payment_attempts_export.id,'paymentId',payment_attempts_export.payment_id,
        'attemptNumber',payment_attempts_export.attempt_number,
        'status',payment_attempts_export.status,'errorCategory',payment_attempts_export.error_category,
        'createdAt',payment_attempts_export.created_at
      ) order by payment_attempts_export.created_at)
      from public.payment_attempts payment_attempts_export
      join public.payments p_attempt on p_attempt.id=payment_attempts_export.payment_id
      where p_user_id in (p_attempt.customer_id,p_attempt.provider_id)
    ),'[]'::jsonb),
    'paymentEvents',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',payment_events_export.id,'paymentId',payment_events_export.payment_id,
        'eventType',payment_events_export.event_type,'amountMinor',payment_events_export.amount_minor,
        'createdAt',payment_events_export.created_at
      ) order by payment_events_export.created_at)
      from public.payment_events payment_events_export
      join public.payments p_event on p_event.id=payment_events_export.payment_id
      where p_user_id in (p_event.customer_id,p_event.provider_id)
    ),'[]'::jsonb),
    'providerSettlements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',settlements_export.id,'paymentId',settlements_export.payment_id,
        'grossMinor',settlements_export.gross_minor,'feeMinor',settlements_export.fee_minor,
        'netMinor',settlements_export.net_minor,'status',settlements_export.status,
        'createdAt',settlements_export.created_at
      ) order by settlements_export.created_at)
      from public.provider_settlements settlements_export
      join public.payments p_settlement on p_settlement.id=settlements_export.payment_id
      where p_user_id in (p_settlement.customer_id,p_settlement.provider_id)
    ),'[]'::jsonb),
    'settlementEvents',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',settlement_events_export.id,'settlementId',settlement_events_export.settlement_id,
        'eventType',settlement_events_export.event_type,'reason',settlement_events_export.reason,
        'createdAt',settlement_events_export.created_at,'staffIdentity','redacted'
      ) order by settlement_events_export.created_at)
      from public.settlement_events settlement_events_export
      join public.provider_settlements ps_event on ps_event.id=settlement_events_export.settlement_id
      join public.payments p_settlement_event on p_settlement_event.id=ps_event.payment_id
      where p_user_id in (p_settlement_event.customer_id,p_settlement_event.provider_id)
    ),'[]'::jsonb),
    'platformFees',coalesce((
      select jsonb_agg(to_jsonb(fees_export))
      from public.platform_fees fees_export
      join public.jobs j_fee on j_fee.id=fees_export.job_id
      where p_user_id in (j_fee.customer_id,j_fee.provider_id)
    ),'[]'::jsonb),
    'financialActionIntents',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',intents_export.id,'sourceType',intents_export.source_type,
        'sourceId',intents_export.source_id,'paymentId',intents_export.payment_id,
        'refundId',intents_export.refund_id,'actionType',intents_export.action_type,
        'amountMinor',intents_export.amount_minor,'status',intents_export.status,
        'failureCategory',intents_export.failure_category,
        'createdAt',intents_export.created_at,'completedAt',intents_export.completed_at
      ) order by intents_export.created_at)
      from public.financial_action_intents intents_export
      left join public.payments p_intent on p_intent.id=intents_export.payment_id
      left join public.disputes d_intent on intents_export.source_type='dispute'
        and d_intent.id=intents_export.source_id
      left join public.jobs j_dispute_intent on j_dispute_intent.id=d_intent.job_id
      left join public.cancellation_requests c_intent on intents_export.source_type='cancellation'
        and c_intent.id=intents_export.source_id
      left join public.jobs j_cancel_intent on j_cancel_intent.id=c_intent.job_id
      left join public.service_requests r_cancel_intent on r_cancel_intent.id=c_intent.request_id
      where p_user_id in (p_intent.customer_id,p_intent.provider_id)
        or p_user_id in (j_dispute_intent.customer_id,j_dispute_intent.provider_id)
        or p_user_id in (j_cancel_intent.customer_id,j_cancel_intent.provider_id)
        or r_cancel_intent.customer_id=p_user_id
    ),'[]'::jsonb)
  );
end $$;

insert into public.data_export_table_classifications(
  table_name,classification,reason,manifest_categories,query_anchors
) values
('account_deletion_requests','exported_with_redaction','Owner privacy request history without internal processing paths.',array['privacyRequests'],array['account_deletion_requests d']),
('account_reauthentications','internal_security_only','Short-lived reauthentication proof metadata is a security control, not portable account content.','{}','{}'),
('addresses','exported_with_redaction','Owner addresses are exported without exact coordinates or access secrets.',array['addresses'],array['public.addresses addresses_export']),
('admin_audit_logs','internal_security_only','Privileged append-only audit records contain staff and security investigation data.','{}','{}'),
('admin_permissions','not_user_related','Static administrative permission catalog contains no owner account data.','{}','{}'),
('admin_role_assignments','internal_security_only','Administrative authorization assignments are security-control records.','{}','{}'),
('admin_role_permissions','not_user_related','Static role-to-permission catalog contains no owner account data.','{}','{}'),
('admin_roles','not_user_related','Static administrative role catalog contains no owner account data.','{}','{}'),
('ai_diagnostics','exported_with_redaction','Owner AI diagnostic outputs are portable while provider secrets remain excluded.',array['aiDiagnostics'],array['public.ai_diagnostics ai_diagnostics_export']),
('ai_message_media','exported_with_redaction','Owner AI media bindings export identifiers and kinds, never private object paths.',array['aiMessageMedia'],array['public.ai_message_media ai_media_export']),
('ai_messages','exported','Owner AI conversation turns are portable account content.',array['aiMessages'],array['public.ai_messages ai_messages_export']),
('ai_prompt_versions','operational_only','Server prompt hashes and rollout versions are service configuration, not owner content.','{}','{}'),
('ai_rate_limit_events','internal_security_only','Rate-limit enforcement events are abuse-prevention security telemetry.','{}','{}'),
('ai_sessions','exported','Owner AI intake session lifecycle and selections are portable.',array['aiSessions'],array['public.ai_sessions ai_sessions_export']),
('ai_usage_events','exported_with_redaction','Owner usage metadata is portable without provider credentials.',array['aiUsage'],array['public.ai_usage_events ai_usage_export']),
('blocked_users','exported_with_redaction','Block relationships affecting the owner are exported with counterparty identity redacted.',array['blockedUsers'],array['public.blocked_users blocked_export']),
('cancellation_decisions','exported_with_redaction','Participant-visible cancellation decisions are portable with staff identity removed.',array['cancellationDecisions'],array['public.cancellation_decisions cancellation_decisions_export']),
('cancellation_requests','exported_with_redaction','All cancellations affecting an owner request or job are portable.',array['cancellations'],array['public.cancellation_requests cancellations_export']),
('change_order_items','exported','Line items for change orders affecting an owner job are portable.',array['changeOrderItems'],array['public.change_order_items change_items_export']),
('change_orders','exported_with_redaction','All change orders and customer decisions affecting an owner job are portable.',array['changeOrders'],array['public.change_orders change_orders_export']),
('cities','not_user_related','Public city reference catalog contains no owner account data.','{}','{}'),
('completion_attempts','exported_with_redaction','Every versioned completion attempt is portable without idempotency keys.',array['completionAttempts'],array['public.completion_attempts attempts_export']),
('completion_proofs','exported_with_redaction','Completion proof metadata is portable without private storage paths.',array['completionProofs'],array['public.completion_proofs completion_proofs_export']),
('conversation_members','exported_with_redaction','Historical owner conversation memberships scope portable communications.',array['conversations','messages','messageAttachments'],array['public.conversation_members conversations_membership_export']),
('conversations','exported','Conversations in which the owner is or was a member are portable.',array['conversations'],array['public.conversations c']),
('customer_acceptance_evidence','exported_with_redaction','Acceptance evidence bindings are portable without private object paths.',array['acceptanceEvidence'],array['public.customer_acceptance_evidence acceptance_evidence_export']),
('customer_acceptances','exported_with_redaction','Every customer completion decision affecting an owner job is portable.',array['customerAcceptances'],array['public.customer_acceptances acceptances_export']),
('data_export_requests','exported_with_redaction','Owner export request history is portable without signed URLs or private paths.',array['privacyRequests'],array['public.data_export_requests privacy_exports_export']),
('data_export_table_classifications','internal_security_only','Schema governance metadata is validated in CI and is not owner account content.','{}','{}'),
('dead_letter_events','internal_security_only','Failed operational event payloads may contain service diagnostics and security data.','{}','{}'),
('dispute_events','exported_with_redaction','Participant-visible dispute events are portable with staff identity removed.',array['disputeEvents'],array['public.dispute_events dispute_events_export']),
('disputes','exported_with_redaction','All disputes affecting an owner job are portable with counterparty identity abstracted.',array['disputes'],array['public.disputes disputes_export']),
('districts','not_user_related','Public district reference catalog contains no owner account data.','{}','{}'),
('external_privacy_requests','operational_only','Externally received privacy intake is handled by the legal workflow and may contain third-party assertions.','{}','{}'),
('feature_flags','operational_only','Feature rollout configuration is service state, not owner account content.','{}','{}'),
('file_uploads','internal_security_only','Canonical upload records contain quarantine paths, hashes, and scanner controls; safe metadata exports through bound resources.','{}','{}'),
('financial_action_intents','exported_with_redaction','Financial intents affecting an owner are portable without provider references, staff IDs, or idempotency keys.',array['financialActionIntents'],array['public.financial_action_intents intents_export']),
('financial_holds','exported_with_redaction','Financial holds affecting an owner job are portable.',array['financialHolds'],array['public.financial_holds holds_export']),
('idempotency_keys','internal_security_only','Command replay hashes and keys are transactional security controls.','{}','{}'),
('invoice_items','operational_only','Invoice line details are represented in the issued invoice snapshot; internal row identifiers are not separately portable.','{}','{}'),
('invoices','exported_with_redaction','Invoices affecting the owner are portable with counterparty contact and private PDF paths removed.',array['invoices'],array['public.invoices invoices_export']),
('job_assignments','exported','Provider assignment history for an owner job is portable.',array['jobAssignments'],array['public.job_assignments assignments_export']),
('job_checklists','exported_with_redaction','Participant-visible checklist state for an owner job is portable with identity abstraction.',array['jobChecklists'],array['public.job_checklists checklists_export']),
('job_events','exported_with_redaction','Job events affecting the owner are portable.',array['jobEvents'],array['public.job_events job_events_export']),
('job_location_sharing_sessions','operational_only','Exact live-location consent sessions are excluded from portable export under the documented location policy.','{}','{}'),
('job_location_updates','operational_only','Exact ephemeral coordinates are excluded from portable export under the documented location policy.','{}','{}'),
('job_notes','exported_with_redaction','Participant-visible notes and notes authored by the owner are portable; operations-only notes are excluded.',array['jobNotes'],array['public.job_notes notes_export']),
('job_status_history','exported_with_redaction','Job lifecycle history affecting the owner is portable.',array['jobHistory'],array['public.job_status_history job_history_export']),
('job_terminal_effects','operational_only','Exactly-once terminal bookkeeping markers are internal transactional controls.','{}','{}'),
('jobs','exported_with_redaction','Jobs involving the owner are portable with role and safe workflow fields.',array['jobs'],array['public.jobs jobs_export']),
('legal_acceptances','exported_with_redaction','Owner legal acceptance history is portable without IP or user-agent hashes.',array['legalAcceptances'],array['public.legal_acceptances legal_export']),
('legal_documents','not_user_related','Published legal document catalog is public reference content, not owner account data.','{}','{}'),
('matching_candidates','operational_only','Internal ranking candidates and exclusion diagnostics are marketplace operations data.','{}','{}'),
('matching_runs','operational_only','Internal matching execution telemetry is marketplace operations data.','{}','{}'),
('message_attachments','exported_with_redaction','Attachment metadata in owner conversations is portable without object paths.',array['messageAttachments'],array['public.message_attachments a']),
('message_delivery_events','exported_with_redaction','Delivery history in owner conversations is portable.',array['messageDeliveryHistory'],array['public.message_delivery_events delivery_export']),
('message_moderation_events','exported_with_redaction','Owner-visible moderation outcomes are portable with staff and unrelated reporter identities redacted.',array['messageModeration'],array['public.message_moderation_events moderation_export']),
('message_read_receipts','exported_with_redaction','Read state in owner conversations is portable with counterparty identity abstracted.',array['messageReadReceipts'],array['public.message_read_receipts read_receipts_export']),
('message_translations','exported_with_redaction','Translations in owner conversations are portable without internal translation job identifiers.',array['messageTranslations'],array['public.message_translations message_translations_export']),
('messages','exported_with_redaction','Sent and received messages in current or historical owner conversations are portable.',array['messages'],array['public.messages m']),
('moderation_actions','internal_security_only','Internal moderation enforcement records may reveal staff methods and unrelated abuse investigations.','{}','{}'),
('notification_outbox','exported_with_redaction','Owner notification and delivery history is portable.',array['notifications'],array['public.notification_outbox notifications_export']),
('notification_preferences','exported','Owner notification preferences are portable.',array['notificationPreferences'],array['public.notification_preferences notification_preferences_export']),
('notification_templates','not_user_related','Notification template catalog contains no owner account data.','{}','{}'),
('offer_revisions','exported_with_redaction','Offer revisions affecting the owner are portable with actor identity abstracted.',array['offerRevisions'],array['public.offer_revisions revisions_export']),
('offer_status_history','exported_with_redaction','Offer status history affecting the owner is portable with actor identity abstracted.',array['offerStatusHistory'],array['public.offer_status_history offer_history_export']),
('offer_withdrawals','exported_with_redaction','Offer withdrawals affecting an owner request are portable.',array['offerWithdrawals'],array['public.offer_withdrawals withdrawals_export']),
('offers','exported_with_redaction','Offers submitted by or received by the owner are portable.',array['offers'],array['public.offers offers_export']),
('payment_attempts','exported_with_redaction','Payment attempt status is portable without gateway references.',array['paymentAttempts'],array['public.payment_attempts payment_attempts_export']),
('payment_events','exported_with_redaction','Payment lifecycle events are portable without provider event identifiers or hashes.',array['paymentEvents'],array['public.payment_events payment_events_export']),
('payments','exported_with_redaction','Payments involving the owner are portable without provider references.',array['payments'],array['public.payments payments_export']),
('platform_fees','exported','Platform fee calculations affecting an owner job are portable.',array['platformFees'],array['public.platform_fees fees_export']),
('privacy_events','internal_security_only','Privacy processing audit events contain operational and security control details.','{}','{}'),
('profiles','exported_with_redaction','The owner profile is portable; unrelated profiles are never included.',array['profile'],array['public.profiles p_export']),
('provider_availability','exported','Provider-owned ordinary availability is portable.',array['providerAvailability'],array['public.provider_availability provider_availability_export']),
('provider_blackout_periods','exported','Provider-owned blackout windows are portable.',array['providerBlackouts'],array['public.provider_blackout_periods provider_blackouts_export']),
('provider_document_reviews','exported_with_redaction','Provider-owned verification decisions are portable with reviewer identity redacted.',array['providerDocumentReviews'],array['public.provider_document_reviews document_reviews_export']),
('provider_documents','exported_with_redaction','Provider-owned document metadata is portable without storage paths or hashes.',array['providerDocuments'],array['public.provider_documents provider_documents_export']),
('provider_job_eligibility_reviews','operational_only','Operations review routing for active jobs is internal case-management metadata.','{}','{}'),
('provider_payout_accounts','internal_security_only','Payout tokens and provider account references are financial security credentials.','{}','{}'),
('provider_performance_snapshots','operational_only','Derived marketplace performance snapshots are internal ranking and operations data.','{}','{}'),
('provider_portfolio_items','exported_with_redaction','Provider-owned portfolio metadata is portable without object paths.',array['providerPortfolio'],array['public.provider_portfolio_items provider_portfolio_export']),
('provider_profiles','exported_with_redaction','Provider-owned profile and commercial registration reference are portable.',array['providerProfile'],array['public.provider_profiles provider_profile_export']),
('provider_qualification_events','exported_with_redaction','Provider-owned restricted qualification history is portable with reviewer identity redacted.',array['providerQualificationHistory'],array['public.provider_qualification_events qualification_events_export']),
('provider_restricted_qualifications','exported_with_redaction','Provider-owned restricted qualification decisions are portable with reviewer identity redacted.',array['providerQualifications'],array['public.provider_restricted_qualifications qualifications_export']),
('provider_service_areas','exported_with_redaction','Provider-owned service areas are portable without exact center coordinates.',array['providerServiceAreas'],array['public.provider_service_areas provider_areas_export']),
('provider_services','exported','Provider-owned service category configuration is portable.',array['providerServices'],array['public.provider_services provider_services_export']),
('provider_settlements','exported_with_redaction','Settlements involving the owner are portable without provider references or idempotency keys.',array['providerSettlements'],array['public.provider_settlements settlements_export']),
('provider_status_history','exported_with_redaction','Provider-owned verification status history is portable with reviewer identity redacted.',array['providerStatusHistory'],array['public.provider_status_history provider_history_export']),
('provider_suspensions','exported_with_redaction','Provider-owned suspension history is portable with staff identity redacted.',array['providerSuspensions'],array['public.provider_suspensions suspensions_export']),
('push_tokens','internal_security_only','Encrypted push tokens and device routing data are authentication-like delivery secrets.','{}','{}'),
('rate_limit_buckets','internal_security_only','Rate-limit counters are abuse-prevention security controls.','{}','{}'),
('rating_replies','operational_only','Rating replies are represented in the customer-facing rating workflow but not separately portable pending moderation policy.','{}','{}'),
('ratings','exported_with_redaction','Ratings involving the owner are portable with participant identifiers removed.',array['ratings'],array['public.ratings ratings_export']),
('receipts','exported_with_redaction','Receipts involving the owner are portable without private PDF paths.',array['receipts'],array['public.receipts receipts_export']),
('refunds','exported_with_redaction','Refunds involving the owner are portable without provider references.',array['refunds'],array['public.refunds refunds_export']),
('request_media','exported_with_redaction','Owner request media metadata is portable without private paths or hashes.',array['requestMedia'],array['public.request_media request_media_export']),
('request_provider_matches','exported_with_redaction','Owner-side matching relationships are portable without competing private data.',array['matches'],array['public.request_provider_matches matches_export']),
('request_publication_events','operational_only','Atomic publication audit events are internal transactional evidence duplicated by request lifecycle data.','{}','{}'),
('request_safety_flags','internal_security_only','Safety classification flags are abuse-prevention controls and may contain investigation data.','{}','{}'),
('request_status_history','operational_only','Request status audit is internal workflow evidence represented by the portable request state.','{}','{}'),
('request_translations','exported','Translations of owner service requests are portable.',array['requestTranslations'],array['public.request_translations request_translations_export']),
('request_visibility','operational_only','Marketplace visibility state is an internal authorization projection.','{}','{}'),
('resolution_actions','operational_only','Internal dispute resolution action rows are represented through participant-visible dispute events and financial intents.','{}','{}'),
('scheduled_jobs','operational_only','Background scheduler state is service operations data, not owner account content.','{}','{}'),
('service_categories','not_user_related','Public service category catalog contains no owner account data.','{}','{}'),
('service_category_translations','not_user_related','Public category translations contain no owner account data.','{}','{}'),
('service_question_translations','not_user_related','Public service question translations contain no owner account data.','{}','{}'),
('service_questions','not_user_related','Public service intake question catalog contains no owner account data.','{}','{}'),
('service_regions','not_user_related','Public service region catalog contains no owner account data.','{}','{}'),
('service_request_answers','exported','Answers belonging to owner service requests are portable.',array['requestAnswers'],array['public.service_request_answers request_answers_export']),
('service_requests','exported_with_redaction','Owner service requests are portable without exact or approximate coordinate objects.',array['serviceRequests'],array['public.service_requests requests_export']),
('service_subcategories','not_user_related','Public service subcategory catalog contains no owner account data.','{}','{}'),
('service_subcategory_translations','not_user_related','Public subcategory translations contain no owner account data.','{}','{}'),
('settlement_events','exported_with_redaction','Settlement lifecycle events affecting the owner are portable without internal metadata or staff identity.',array['settlementEvents'],array['public.settlement_events settlement_events_export']),
('support_case_access_grants','internal_security_only','Temporary support authorization grants are privileged security-control records.','{}','{}'),
('support_case_assignments','operational_only','Support staffing assignments are internal case-management records.','{}','{}'),
('support_case_evidence','exported_with_redaction','User-visible support evidence metadata is portable without private paths or hashes.',array['supportEvidence'],array['public.support_case_evidence support_evidence_export']),
('support_case_messages','exported_with_redaction','User-visible support replies for owner cases are portable; internal replies are excluded.',array['supportMessages'],array['public.support_case_messages support_messages_export']),
('support_cases','exported_with_redaction','Support cases opened by the owner are portable without internal assignment data.',array['supportCases'],array['public.support_cases support_cases_export']),
('support_internal_notes','internal_security_only','Internal support notes are explicitly excluded from portable owner exports.','{}','{}'),
('system_incidents','operational_only','System incident records are service reliability data and may include unrelated tenants.','{}','{}'),
('system_settings','operational_only','Service configuration is operational state, not owner account content.','{}','{}'),
('transcription_jobs','exported_with_redaction','Owner transcription metadata and output are portable without private audio paths.',array['transcriptions'],array['public.transcription_jobs transcriptions_export']),
('translation_jobs','operational_only','Internal translation queue records are represented by user-visible translated resources.','{}','{}'),
('upload_security_events','exported_with_redaction','Owner upload security event types are portable without scanner internals.',array['uploadSecurityEvents'],array['public.upload_security_events upload_events_export']),
('user_devices','exported_with_redaction','Owner device history is portable without device hashes.',array['devices'],array['public.user_devices devices_export']),
('user_preferences','exported','Owner application preferences are portable.',array['preferences'],array['public.user_preferences preferences_export']),
('user_roles','exported','Owner marketplace role history is portable.',array['roles'],array['public.user_roles roles_export']),
('webhook_events','internal_security_only','Webhook payload hashes and provider event processing state are integration security controls.','{}','{}');

create function public.assert_data_export_catalog_complete() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare missing_tables text[]; stale_tables text[]; item record; export_source text;
begin
  select array_agg(c.relname order by c.relname) into missing_tables
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  left join public.data_export_table_classifications x on x.table_name=c.relname
  where n.nspname='public' and c.relkind='r' and x.table_name is null;
  if coalesce(cardinality(missing_tables),0)>0 then
    raise exception 'UNCLASSIFIED_PUBLIC_TABLES:%',array_to_string(missing_tables,',');
  end if;
  select array_agg(x.table_name order by x.table_name) into stale_tables
  from public.data_export_table_classifications x
  left join pg_catalog.pg_class c on c.relname=x.table_name
    and c.relnamespace='public'::regnamespace and c.relkind='r'
  where c.oid is null;
  if coalesce(cardinality(stale_tables),0)>0 then
    raise exception 'STALE_TABLE_CLASSIFICATIONS:%',array_to_string(stale_tables,',');
  end if;
  select pg_get_functiondef('public.build_data_export(uuid,uuid)'::regprocedure)
    || pg_get_functiondef('public.build_data_export_v3(uuid,uuid)'::regprocedure)
  into export_source;
  for item in
    select table_name,unnest(query_anchors) anchor
    from public.data_export_table_classifications
    where classification in ('exported','exported_with_redaction')
  loop
    if strpos(export_source,item.anchor)=0 then
      raise exception 'EXPORT_QUERY_ANCHOR_MISSING:%:%',item.table_name,item.anchor;
    end if;
  end loop;
  return true;
end $$;

revoke all on function public.get_data_export_manifest() from public,anon,authenticated;
revoke all on function public.get_data_export_query_coverage() from public,anon,authenticated;
revoke all on function public.build_data_export(uuid,uuid) from public,anon,authenticated;
revoke all on function public.assert_data_export_catalog_complete() from public,anon,authenticated;
grant execute on function public.get_data_export_manifest() to authenticated,service_role;
grant execute on function public.get_data_export_query_coverage() to service_role;
grant execute on function public.build_data_export(uuid,uuid) to service_role;
grant execute on function public.assert_data_export_catalog_complete() to service_role;

commit;
