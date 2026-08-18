begin;

create function private.has_role(required public.user_role[]) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.user_roles where user_id=auth.uid() and role=any(required) and revoked_at is null)
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select private.has_role(array['operations_admin','verification_reviewer','support_agent','finance_reviewer','analyst','super_admin']::public.user_role[])
$$;
create function private.can_read_request(target uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.service_requests r where r.id=target and r.customer_id=auth.uid())
  or exists(select 1 from public.request_provider_matches m where m.request_id=target and m.provider_id=auth.uid() and m.status in ('invited','viewed','offered','selected'))
  or private.is_admin()
$$;
create function private.can_access_job(target uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.jobs j where j.id=target and auth.uid() in (j.customer_id,j.provider_id)) or private.is_admin()
$$;
create function private.can_access_conversation(target uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.conversation_members m where m.conversation_id=target and m.user_id=auth.uid() and m.left_at is null)
$$;

create view public.provider_public_profiles with (security_barrier=true) as
select p.user_id,p.kind,p.business_name,p.bio,p.preferred_brief_locale,p.verification_status,p.rating_average,p.rating_count,p.completed_jobs,p.response_rate,p.created_at
from public.provider_profiles p join public.profiles u on u.id=p.user_id
where p.verification_status='verified' and u.status='active';

create view public.provider_request_briefs with (security_barrier=true) as
select r.id,r.category_id,r.subcategory_id,r.city_id,r.district_id,r.title,r.structured_description,r.original_text,r.original_locale,r.urgency,
       r.requested_start,r.requested_end,r.approximate_location,r.status,r.version,r.published_at
from public.service_requests r
where private.can_read_request(r.id) and r.status in ('published','matching','receiving_offers','provider_selected');

-- Deny by default on every application table. Policies below are the only client paths.
do $$ declare item record; begin
  for item in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security',item.tablename);
  end loop;
end $$;

create policy profiles_self_read on public.profiles for select using(id=auth.uid() or private.is_admin());
create policy profiles_self_update on public.profiles for update using(id=auth.uid()) with check(id=auth.uid() and status='active');
create policy roles_self_read on public.user_roles for select using(user_id=auth.uid() or private.is_admin());
create policy preferences_self_all on public.user_preferences for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy notification_preferences_self_all on public.notification_preferences for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy addresses_authorized_read on public.addresses for select using(
  user_id=auth.uid() or private.is_admin() or exists(select 1 from public.jobs j where j.exact_address_id=addresses.id and j.provider_id=auth.uid())
);
create policy addresses_owner_write on public.addresses for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy legal_documents_public_read on public.legal_documents for select using(published_at is not null and effective_at<=now());
create policy legal_acceptances_owner on public.legal_acceptances for select using(user_id=auth.uid() or private.is_admin());
create policy legal_acceptances_insert on public.legal_acceptances for insert with check(user_id=auth.uid());
create policy deletion_owner_read on public.account_deletion_requests for select using(user_id=auth.uid() or private.is_admin());
create policy export_owner_read on public.data_export_requests for select using(user_id=auth.uid() or private.is_admin());
create policy blocks_owner_all on public.blocked_users for all using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());
create policy devices_owner_all on public.user_devices for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy push_owner_all on public.push_tokens for all using(user_id=auth.uid()) with check(user_id=auth.uid());

create policy catalog_categories_read on public.service_categories for select using(enabled);
create policy catalog_category_translations_read on public.service_category_translations for select using(true);
create policy catalog_subcategories_read on public.service_subcategories for select using(enabled);
create policy catalog_subcategory_translations_read on public.service_subcategory_translations for select using(true);
create policy catalog_questions_read on public.service_questions for select using(enabled);
create policy catalog_question_translations_read on public.service_question_translations for select using(true);
create policy catalog_regions_read on public.service_regions for select using(enabled);
create policy catalog_cities_read on public.cities for select using(enabled);
create policy catalog_districts_read on public.districts for select using(enabled);

create policy provider_profile_private on public.provider_profiles for select using(user_id=auth.uid() or private.is_admin());
create policy provider_profile_owner_update on public.provider_profiles for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy provider_services_owner_read on public.provider_services for select using(provider_id=auth.uid() or private.is_admin());
create policy provider_services_owner_write on public.provider_services for all using(provider_id=auth.uid()) with check(provider_id=auth.uid());
create policy provider_areas_owner on public.provider_service_areas for all using(provider_id=auth.uid() or private.is_admin()) with check(provider_id=auth.uid());
create policy provider_documents_private on public.provider_documents for select using(provider_id=auth.uid() or private.has_role(array['verification_reviewer','super_admin']::public.user_role[]));
create policy provider_documents_owner_insert on public.provider_documents for insert with check(provider_id=auth.uid());
create policy provider_document_reviews_staff on public.provider_document_reviews for select using(reviewer_id=auth.uid() or exists(select 1 from public.provider_documents d where d.id=provider_document_reviews.document_id and d.provider_id=auth.uid()) or private.has_role(array['verification_reviewer','super_admin']::public.user_role[]));
create policy provider_availability_owner on public.provider_availability for all using(provider_id=auth.uid() or private.is_admin()) with check(provider_id=auth.uid());
create policy provider_blackouts_owner on public.provider_blackout_periods for all using(provider_id=auth.uid() or private.is_admin()) with check(provider_id=auth.uid());
create policy provider_portfolio_owner on public.provider_portfolio_items for all using(provider_id=auth.uid() or private.is_admin()) with check(provider_id=auth.uid());
create policy provider_performance_read on public.provider_performance_snapshots for select using(provider_id=auth.uid() or private.is_admin());
create policy provider_status_history_read on public.provider_status_history for select using(provider_id=auth.uid() or private.is_admin());
create policy provider_payout_private on public.provider_payout_accounts for select using(provider_id=auth.uid() or private.has_role(array['finance_reviewer','super_admin']::public.user_role[]));
create policy provider_suspensions_read on public.provider_suspensions for select using(provider_id=auth.uid() or private.is_admin());

create policy requests_authorized_read on public.service_requests for select using(private.can_read_request(id));
create policy request_answers_authorized on public.service_request_answers for select using(private.can_read_request(request_id));
create policy request_media_authorized on public.request_media for select using(private.can_read_request(request_id));
create policy request_history_authorized on public.request_status_history for select using(private.can_read_request(request_id));
create policy request_safety_authorized on public.request_safety_flags for select using(private.can_read_request(request_id));
create policy request_visibility_authorized on public.request_visibility for select using(private.can_read_request(request_id));
create policy request_publication_customer on public.request_publication_events for select using(private.can_read_request(request_id));

create policy ai_sessions_owner on public.ai_sessions for select using(user_id=auth.uid() or private.is_admin());
create policy ai_messages_owner on public.ai_messages for select using(exists(select 1 from public.ai_sessions s where s.id=ai_messages.session_id and (s.user_id=auth.uid() or private.is_admin())));
create policy ai_diagnostics_owner on public.ai_diagnostics for select using(exists(select 1 from public.ai_sessions s where s.id=ai_diagnostics.session_id and (s.user_id=auth.uid() or private.is_admin())));
create policy ai_usage_owner on public.ai_usage_events for select using(user_id=auth.uid() or private.is_admin());
create policy request_translations_authorized on public.request_translations for select using(private.can_read_request(request_id));
create policy transcription_owner on public.transcription_jobs for select using(user_id=auth.uid() or private.is_admin());

create policy matching_runs_authorized on public.matching_runs for select using(private.can_read_request(request_id));
create policy matching_candidates_provider_staff on public.matching_candidates for select using(provider_id=auth.uid() or private.is_admin());
create policy matches_parties on public.request_provider_matches for select using(provider_id=auth.uid() or private.can_read_request(request_id));
create policy offers_sealed on public.offers for select using(provider_id=auth.uid() or exists(select 1 from public.service_requests r where r.id=offers.request_id and r.customer_id=auth.uid()) or private.is_admin());
create policy offer_revisions_sealed on public.offer_revisions for select using(exists(select 1 from public.offers o where o.id=offer_revisions.offer_id and (o.provider_id=auth.uid() or exists(select 1 from public.service_requests r where r.id=o.request_id and r.customer_id=auth.uid()) or private.is_admin())));
create policy offer_history_sealed on public.offer_status_history for select using(exists(select 1 from public.offers o where o.id=offer_status_history.offer_id and (o.provider_id=auth.uid() or exists(select 1 from public.service_requests r where r.id=o.request_id and r.customer_id=auth.uid()) or private.is_admin())));
create policy offer_withdrawals_owner on public.offer_withdrawals for select using(provider_id=auth.uid() or private.is_admin());

create policy jobs_participants on public.jobs for select using(auth.uid() in (customer_id,provider_id) or private.is_admin());
create policy job_history_participants on public.job_status_history for select using(private.can_access_job(job_id));
create policy job_events_participants on public.job_events for select using(private.can_access_job(job_id));
create policy job_assignments_participants on public.job_assignments for select using(private.can_access_job(job_id));
create policy job_location_participants on public.job_location_updates for select using(expires_at>now() and private.can_access_job(job_id));
create policy job_checklists_participants on public.job_checklists for select using(private.can_access_job(job_id));
create policy job_notes_participants on public.job_notes for select using(private.can_access_job(job_id) and (visibility='participants' or author_id=auth.uid() or private.is_admin()));
create policy change_orders_participants on public.change_orders for select using(private.can_access_job(job_id));
create policy change_order_items_participants on public.change_order_items for select using(exists(select 1 from public.change_orders c where c.id=change_order_items.change_order_id and private.can_access_job(c.job_id)));
create policy completion_proofs_participants on public.completion_proofs for select using(private.can_access_job(job_id));
create policy acceptances_participants on public.customer_acceptances for select using(private.can_access_job(job_id));
create policy ratings_participants on public.ratings for select using(provider_id=auth.uid() or customer_id=auth.uid() or moderation_status='published' or private.is_admin());
create policy rating_replies_read on public.rating_replies for select using(moderation_status='published' or provider_id=auth.uid() or private.is_admin());

create policy conversations_members on public.conversations for select using(private.can_access_conversation(id));
create policy conversation_members_members on public.conversation_members for select using(private.can_access_conversation(conversation_id));
create policy messages_members_read on public.messages for select using(private.can_access_conversation(conversation_id));
create policy messages_members_insert on public.messages for insert with check(sender_id=auth.uid() and private.can_access_conversation(conversation_id));
create policy message_attachments_members on public.message_attachments for select using(exists(select 1 from public.messages m where m.id=message_attachments.message_id and private.can_access_conversation(m.conversation_id)));
create policy message_delivery_members on public.message_delivery_events for select using(user_id=auth.uid() or private.is_admin());
create policy message_receipts_members on public.message_read_receipts for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy message_translations_members on public.message_translations for select using(exists(select 1 from public.messages m where m.id=message_translations.message_id and private.can_access_conversation(m.conversation_id)));
create policy moderation_reporter_staff on public.message_moderation_events for select using(reporter_id=auth.uid() or private.is_admin());

create policy payments_participants on public.payments for select using(customer_id=auth.uid() or provider_id=auth.uid() or private.has_role(array['finance_reviewer','super_admin']::public.user_role[]));
create policy refunds_customer_finance on public.refunds for select using(exists(select 1 from public.payments p where p.id=refunds.payment_id and p.customer_id=auth.uid()) or private.has_role(array['finance_reviewer','super_admin']::public.user_role[]));
create policy settlements_provider_finance on public.provider_settlements for select using(provider_id=auth.uid() or private.has_role(array['finance_reviewer','super_admin']::public.user_role[]));
create policy invoices_job_participants on public.invoices for select using(private.can_access_job(job_id));
create policy invoice_items_participants on public.invoice_items for select using(exists(select 1 from public.invoices i where i.id=invoice_items.invoice_id and private.can_access_job(i.job_id)));
create policy receipts_participants on public.receipts for select using(exists(select 1 from public.payments p where p.id=receipts.payment_id and (p.customer_id=auth.uid() or p.provider_id=auth.uid())) or private.has_role(array['finance_reviewer','super_admin']::public.user_role[]));
create policy holds_participants on public.financial_holds for select using(private.can_access_job(job_id) or private.has_role(array['finance_reviewer','super_admin']::public.user_role[]));

create policy support_cases_participants on public.support_cases for select using(opened_by=auth.uid() or private.is_admin());
create policy support_cases_open on public.support_cases for insert with check(opened_by=auth.uid());
create policy support_messages_participants on public.support_case_messages for select using(exists(select 1 from public.support_cases c where c.id=support_case_messages.case_id and (c.opened_by=auth.uid() or private.is_admin())) and (visible_to_user or private.is_admin()));
create policy support_messages_insert on public.support_case_messages for insert with check(sender_id=auth.uid() and exists(select 1 from public.support_cases c where c.id=case_id and c.opened_by=auth.uid()));
create policy support_evidence_participants on public.support_case_evidence for select using(exists(select 1 from public.support_cases c where c.id=support_case_evidence.case_id and (c.opened_by=auth.uid() or private.is_admin())));
create policy support_internal_staff on public.support_internal_notes for select using(private.has_role(array['support_agent','operations_admin','super_admin']::public.user_role[]));
create policy cancellations_participants on public.cancellation_requests for select using(requester_id=auth.uid() or private.is_admin() or (job_id is not null and private.can_access_job(job_id)));
create policy disputes_participants on public.disputes for select using(opened_by=auth.uid() or private.can_access_job(job_id));
create policy dispute_events_participants on public.dispute_events for select using(exists(select 1 from public.disputes d where d.id=dispute_events.dispute_id and private.can_access_job(d.job_id)));
create policy notification_owner on public.notification_outbox for select using(user_id=auth.uid() or private.is_admin());

-- Public catalog access and authenticated RLS-gated reads.
revoke all on all tables in schema public from anon,authenticated;
grant usage on schema public to anon,authenticated;
grant select on public.service_categories,public.service_category_translations,public.service_subcategories,public.service_subcategory_translations,
  public.service_questions,public.service_question_translations,public.service_regions,public.cities,public.districts,public.legal_documents,
  public.provider_public_profiles to anon,authenticated;
grant select on all tables in schema public to authenticated;
grant update(display_name,phone,preferred_locale,avatar_path) on public.profiles to authenticated;
grant insert,update,delete on public.user_preferences,public.notification_preferences,public.addresses,public.blocked_users,public.user_devices,public.push_tokens,
  public.provider_services,public.provider_service_areas,public.provider_availability,public.provider_blackout_periods,public.provider_portfolio_items to authenticated;
grant insert on public.provider_documents,public.legal_acceptances,public.messages,public.message_read_receipts,public.support_cases,public.support_case_messages,public.support_case_evidence to authenticated;
grant usage,select on all sequences in schema public to authenticated;
grant select on public.provider_request_briefs to authenticated;

-- Storage is private; paths begin with the owner's UUID. Signed URLs are produced by authorized server commands.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('request-media','request-media',false,20971520,array['image/jpeg','image/png','image/webp','video/mp4','audio/mp4','audio/webm']),
 ('provider-documents','provider-documents',false,20971520,array['image/jpeg','image/png','application/pdf']),
 ('message-attachments','message-attachments',false,20971520,array['image/jpeg','image/png','image/webp','application/pdf']),
 ('completion-proofs','completion-proofs',false,20971520,array['image/jpeg','image/png','image/webp','video/mp4']),
 ('exports','exports',false,52428800,array['application/json','application/zip','text/csv']),
 ('invoices','invoices',false,10485760,array['application/pdf'])
on conflict(id) do update set public=false;
create policy storage_owner_insert on storage.objects for insert to authenticated with check((storage.foldername(name))[1]=auth.uid()::text);
create policy storage_owner_read on storage.objects for select to authenticated using(owner_id=auth.uid()::text or private.is_admin());
create policy storage_owner_delete on storage.objects for delete to authenticated using(owner_id=auth.uid()::text);

create function public.publish_service_request(payload jsonb) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare actor uuid:=auth.uid(); request_id uuid; address_id uuid; city_id uuid; category_id uuid; idem text; existing jsonb; lat double precision; lon double precision; item jsonb; diag jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from profiles where id=actor and status='active') then raise exception 'ACCOUNT_NOT_ACTIVE'; end if;
  if coalesce((payload->>'customer_approved')::boolean,false) is not true then raise exception 'CUSTOMER_APPROVAL_REQUIRED'; end if;
  idem:=payload->>'idempotency_key'; if length(coalesce(idem,''))<16 then raise exception 'INVALID_IDEMPOTENCY_KEY'; end if;
  select response into existing from idempotency_keys where user_id=actor and command='publish_service_request' and key=idem;
  if existing is not null then return (existing->>'id')::uuid; end if;
  insert into idempotency_keys(user_id,command,key,request_hash) values(actor,'publish_service_request',idem,encode(digest(payload::text,'sha256'),'hex')) on conflict do nothing;
  select id into city_id from cities where code=coalesce(payload->>'city_code','riyadh') and enabled limit 1;
  diag:=payload->'ai_diagnostic';
  select id into category_id from service_categories where slug=coalesce(diag->>'suggestedCategorySlug',payload->>'category_slug','general-handyman') and enabled limit 1;
  if city_id is null or category_id is null then raise exception 'CATALOG_CONFIGURATION_REQUIRED'; end if;
  lat:=(payload->'exact_location'->>'latitude')::double precision; lon:=(payload->'exact_location'->>'longitude')::double precision;
  if lat not between 16 and 33 or lon not between 34 and 56 then raise exception 'LOCATION_OUTSIDE_SAUDI_ARABIA'; end if;
  insert into addresses(user_id,city_id,label,formatted_address,location)
    values(actor,city_id,'Service location','Private location selected in app',st_setsrid(st_makepoint(lon,lat),4326)::geography) returning id into address_id;
  insert into service_requests(customer_id,category_id,city_id,title,structured_description,original_text,original_locale,urgency,approximate_location,exact_address_id,
    ai_provider,ai_model,ai_prompt_version,customer_approved_at,published_at,status)
  values(actor,category_id,city_id,left(coalesce(nullif(payload->>'title',''),payload->>'structured_description'),120),payload->>'structured_description',payload->>'original_text',
    coalesce(payload->>'locale','ar'),coalesce((payload->>'urgency')::request_urgency,'normal'),st_setsrid(st_makepoint(round(lon::numeric,2),round(lat::numeric,2)),4326)::geography,address_id,
    diag->'metadata'->>'provider',diag->'metadata'->>'model',diag->'metadata'->>'promptVersion',now(),now(),'published') returning id into request_id;
  insert into request_visibility(request_id) values(request_id);
  insert into request_status_history(request_id,actor_id,new_status,reason,idempotency_key) values(request_id,actor,'published','customer_approved',idem);
  insert into request_publication_events(request_id,actor_id,request_version,approval_snapshot,idempotency_key) values(request_id,actor,1,payload,idem);
  for item in select value from jsonb_array_elements(coalesce(payload->'media','[]'::jsonb)) loop
    if item->>'storage_path' is not null then
      insert into request_media(request_id,uploader_id,storage_path,mime_type,size_bytes,media_kind,upload_status)
      values(request_id,actor,item->>'storage_path',item->>'mime_type',coalesce((item->>'size')::bigint,1),'request','uploaded');
    end if;
  end loop;
  for item in select to_jsonb(value) from jsonb_array_elements_text(coalesce(diag->'safetyFlags','[]'::jsonb)) loop
    insert into request_safety_flags(request_id,flag_type,source,severity,guidance_version) values(request_id,item#>>'{}','ai','high','safety-v1');
  end loop;
  update idempotency_keys set status='completed',response=jsonb_build_object('id',request_id) where user_id=actor and command='publish_service_request' and key=idem;
  return request_id;
exception when others then
  update idempotency_keys set status='failed' where user_id=actor and command='publish_service_request' and key=idem;
  raise;
end $$;

create function public.run_matching(p_request_id uuid,p_limit integer default 20) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_run_id uuid; req service_requests%rowtype;
begin
  select * into req from service_requests where id=p_request_id for update;
  if req.id is null or req.status not in ('published','matching','receiving_offers') then raise exception 'REQUEST_NOT_MATCHABLE'; end if;
  insert into matching_runs(request_id,configuration_version,weights) values(p_request_id,'v1','{"distance":0.25,"availability":0.15,"rating":0.2,"response":0.15,"workload":0.15,"completedJobs":0.1}') returning id into v_run_id;
  insert into matching_candidates(matching_run_id,provider_id,eligible,score,score_components,exclusion_reason)
  select v_run_id,p.user_id,
    p.verification_status='verified' and p.accepting_requests and u.status='active' and ps.enabled and not exists(select 1 from blocked_users b where (b.blocker_id=req.customer_id and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=req.customer_id)),
    case when p.verification_status='verified' and p.accepting_requests and u.status='active' and ps.enabled then
      least(1,p.rating_average/5)*.2 + least(1,p.response_rate)*.15 + greatest(0,1-p.active_workload::numeric/10)*.15 + least(1,p.completed_jobs::numeric/100)*.1 + .15 + .25 else null end,
    jsonb_build_object('rating',p.rating_average,'responseRate',p.response_rate,'activeWorkload',p.active_workload,'completedJobs',p.completed_jobs),
    case when p.verification_status<>'verified' then 'provider_not_verified' when not p.accepting_requests then 'provider_unavailable' when u.status<>'active' then 'provider_suspended' when not ps.enabled then 'category_not_supported' else null end
  from provider_profiles p join profiles u on u.id=p.user_id join provider_services ps on ps.provider_id=p.user_id and ps.category_id=req.category_id
  where exists(select 1 from provider_service_areas a where a.provider_id=p.user_id and a.enabled and a.city_id=req.city_id and (a.district_id is null or a.district_id=req.district_id) and (a.center is null or st_dwithin(a.center,req.approximate_location,a.radius_m)));
  insert into request_provider_matches(request_id,provider_id,matching_run_id,score,expires_at)
  select p_request_id,provider_id,v_run_id,score,now()+interval '24 hours' from matching_candidates where matching_run_id=v_run_id and eligible order by score desc limit least(p_limit,100)
  on conflict(request_id,provider_id) do update set matching_run_id=excluded.matching_run_id,score=excluded.score,status='invited',expires_at=excluded.expires_at;
  update matching_runs set status='completed',candidate_count=(select count(*) from matching_candidates where matching_run_id=v_run_id),completed_at=now() where id=v_run_id;
  update service_requests set status='receiving_offers',version=version+1 where id=p_request_id;
  insert into notification_outbox(user_id,event_type,channel,payload,deduplication_key)
    select provider_id,'provider_matched','in_app',jsonb_build_object('requestId',p_request_id),v_run_id::text||':'||provider_id::text from request_provider_matches where matching_run_id=v_run_id on conflict do nothing;
  return v_run_id;
end $$;

create function public.submit_offer(payload jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); offer_id uuid; v_request_id uuid:=(payload->>'requestId')::uuid; req_version integer; idem text:=payload->>'idempotencyKey'; existing jsonb;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists(select 1 from provider_profiles where user_id=actor and verification_status='verified' and accepting_requests) then raise exception 'VERIFIED_PROVIDER_REQUIRED'; end if;
  if not exists(select 1 from request_provider_matches where request_id=v_request_id and provider_id=actor and status in ('invited','viewed','offered') and expires_at>now()) then raise exception 'MATCH_REQUIRED'; end if;
  select version into req_version from service_requests where id=v_request_id and status='receiving_offers';
  if req_version is null or req_version<>(payload->>'expectedRequestVersion')::integer then raise exception 'REQUEST_VERSION_CONFLICT'; end if;
  select response into existing from idempotency_keys where user_id=actor and command='submit_offer' and key=idem;
  if existing is not null then return (existing->>'id')::uuid; end if;
  insert into idempotency_keys(user_id,command,key,request_hash) values(actor,'submit_offer',idem,encode(digest(payload::text,'sha256'),'hex')) on conflict do nothing;
  insert into offers(request_id,provider_id,total_amount_minor,visit_fee_minor,labor_amount_minor,materials_included,materials_estimate_minor,estimated_arrival_minutes,
    estimated_duration_minutes,warranty_days,provider_note,expires_at,idempotency_key)
  values(v_request_id,actor,(payload->>'totalAmountMinor')::bigint,coalesce((payload->>'visitFeeMinor')::bigint,0),(payload->>'laborAmountMinor')::bigint,
    (payload->>'materialsIncluded')::boolean,(payload->>'materialsEstimateMinor')::bigint,(payload->>'estimatedArrivalMinutes')::integer,
    (payload->>'estimatedDurationMinutes')::integer,(payload->>'warrantyDays')::integer,coalesce(payload->>'note',''),(payload->>'expiresAt')::timestamptz,idem)
  on conflict(provider_id,request_id) do update set total_amount_minor=excluded.total_amount_minor,visit_fee_minor=excluded.visit_fee_minor,labor_amount_minor=excluded.labor_amount_minor,
    materials_included=excluded.materials_included,materials_estimate_minor=excluded.materials_estimate_minor,estimated_arrival_minutes=excluded.estimated_arrival_minutes,
    estimated_duration_minutes=excluded.estimated_duration_minutes,warranty_days=excluded.warranty_days,provider_note=excluded.provider_note,expires_at=excluded.expires_at,
    status='active',version=offers.version+1,updated_at=now(),idempotency_key=excluded.idempotency_key returning id into offer_id;
  update request_provider_matches set status='offered' where request_id=v_request_id and provider_id=actor;
  insert into notification_outbox(user_id,event_type,channel,payload,deduplication_key)
    select customer_id,'new_offer','in_app',jsonb_build_object('requestId',v_request_id,'offerId',offer_id),'offer:'||offer_id::text from service_requests where id=v_request_id;
  update idempotency_keys set status='completed',response=jsonb_build_object('id',offer_id) where user_id=actor and command='submit_offer' and key=idem;
  return offer_id;
end $$;

create function public.select_offer(p_offer_id uuid,p_idempotency_key text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); selected offers%rowtype; req service_requests%rowtype; job_id uuid; conversation_id uuid; existing jsonb;
begin
  select response into existing from idempotency_keys where user_id=actor and command='select_offer' and key=p_idempotency_key;
  if existing is not null then return (existing->>'id')::uuid; end if;
  select * into selected from offers where id=p_offer_id and status='active' and expires_at>now() for update;
  select * into req from service_requests where id=selected.request_id and customer_id=actor and status='receiving_offers' for update;
  if selected.id is null or req.id is null or req.exact_address_id is null then raise exception 'OFFER_NOT_SELECTABLE'; end if;
  insert into idempotency_keys(user_id,command,key) values(actor,'select_offer',p_idempotency_key);
  update offers set status=case when id=p_offer_id then 'selected'::offer_status else 'rejected'::offer_status end,updated_at=now() where request_id=req.id and status='active';
  update service_requests set status='provider_selected',version=version+1 where id=req.id;
  insert into jobs(request_id,selected_offer_id,customer_id,provider_id,exact_address_id,approved_total_minor)
    values(req.id,p_offer_id,actor,selected.provider_id,req.exact_address_id,selected.total_amount_minor) returning id into job_id;
  insert into job_status_history(job_id,actor_id,new_status,reason,idempotency_key) values(job_id,actor,'provider_selected','customer_selected_offer',p_idempotency_key);
  insert into conversations(job_id) values(job_id) returning id into conversation_id;
  insert into conversation_members(conversation_id,user_id,member_role) values(conversation_id,actor,'customer'),(conversation_id,selected.provider_id,'provider');
  insert into payments(job_id,customer_id,provider_id,provider_name,amount_minor,status,payment_mode,idempotency_key)
    values(job_id,actor,selected.provider_id,'offline',selected.total_amount_minor,'offline','offline','offline:'||job_id::text);
  update request_provider_matches set status=case when provider_id=selected.provider_id then 'selected' else 'closed' end where request_id=req.id;
  update idempotency_keys set status='completed',response=jsonb_build_object('id',job_id) where user_id=actor and command='select_offer' and key=p_idempotency_key;
  return job_id;
end $$;

create function public.transition_job(p_job_id uuid,p_to_status text,p_reason text,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); job jobs%rowtype; target job_status; allowed boolean:=false; existing jsonb;
begin
  if length(trim(p_reason))<2 then raise exception 'REASON_REQUIRED'; end if;
  target:=p_to_status::job_status;
  select response into existing from idempotency_keys where user_id=actor and command='transition_job' and key=p_idempotency_key;
  if existing is not null then return existing; end if;
  select * into job from jobs where id=p_job_id and actor in (customer_id,provider_id) for update;
  if job.id is null then raise exception 'JOB_ACCESS_DENIED'; end if;
  allowed:=case job.status
    when 'provider_selected' then target in ('scheduled','cancelled') when 'scheduled' then target in ('en_route','cancelled')
    when 'en_route' then target in ('arrived','cancelled') when 'arrived' then target in ('diagnosing','cancelled')
    when 'diagnosing' then target in ('awaiting_change_order_approval','in_progress','cancelled')
    when 'awaiting_change_order_approval' then target in ('in_progress','diagnosing','cancelled','disputed')
    when 'in_progress' then target in ('completion_submitted','disputed','cancelled')
    when 'completion_submitted' then target in ('completed','in_progress','disputed') when 'completed' then target='disputed' when 'cancelled' then target='disputed' else false end;
  if not allowed then raise exception 'INVALID_JOB_TRANSITION:%:%',job.status,target; end if;
  if actor=job.provider_id and target in ('completed','disputed') then raise exception 'CUSTOMER_ACTION_REQUIRED'; end if;
  if actor=job.customer_id and target in ('en_route','arrived','diagnosing','in_progress','completion_submitted') then raise exception 'PROVIDER_ACTION_REQUIRED'; end if;
  insert into idempotency_keys(user_id,command,key) values(actor,'transition_job',p_idempotency_key);
  update jobs set status=target,version=version+1,updated_at=now(),completed_at=case when target='completed' then now() else completed_at end where id=p_job_id;
  insert into job_status_history(job_id,actor_id,previous_status,new_status,reason,idempotency_key) values(p_job_id,actor,job.status,target,p_reason,p_idempotency_key);
  update idempotency_keys set status='completed',response=jsonb_build_object('jobId',p_job_id,'status',target,'version',job.version+1) where user_id=actor and command='transition_job' and key=p_idempotency_key;
  return jsonb_build_object('jobId',p_job_id,'status',target,'version',job.version+1);
end $$;

create function public.create_change_order(payload jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); job jobs%rowtype; order_id uuid; added bigint; item jsonb;
begin
  select * into job from jobs where id=(payload->>'jobId')::uuid and provider_id=actor and status in ('diagnosing','in_progress') for update;
  if job.id is null then raise exception 'PROVIDER_JOB_REQUIRED'; end if;
  select coalesce(sum(((value->>'quantity')::numeric*(value->>'amountMinor')::bigint)::bigint),0) into added from jsonb_array_elements(payload->'lineItems');
  insert into change_orders(job_id,provider_id,reason,description,added_amount_minor,revised_total_minor,expires_at,idempotency_key)
  values(job.id,actor,payload->>'reason',payload->>'description',added,job.approved_total_minor+added,(payload->>'expiresAt')::timestamptz,payload->>'idempotencyKey') returning id into order_id;
  for item in select value from jsonb_array_elements(payload->'lineItems') loop insert into change_order_items(change_order_id,description,quantity,unit_amount_minor) values(order_id,item->>'description',(item->>'quantity')::numeric,(item->>'amountMinor')::bigint); end loop;
  if job.status='diagnosing' then perform public.transition_job(job.id,'awaiting_change_order_approval','change_order_submitted','co:'||order_id::text); end if;
  return order_id;
end $$;

create function public.decide_change_order(p_change_order_id uuid,p_approve boolean,p_reason text,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); change change_orders%rowtype; job jobs%rowtype;
begin
  select c.* into change from change_orders c join jobs j on j.id=c.job_id where c.id=p_change_order_id and j.customer_id=actor and c.status='pending' and c.expires_at>now() for update;
  if change.id is null then raise exception 'CHANGE_ORDER_NOT_DECIDABLE'; end if;
  select * into job from jobs where id=change.job_id for update;
  update change_orders set status=case when p_approve then 'approved'::change_order_status else 'rejected'::change_order_status end,customer_id=actor,customer_decision_at=now() where id=change.id;
  if p_approve then update jobs set approved_total_minor=change.revised_total_minor,version=version+1 where id=job.id; end if;
  perform public.transition_job(job.id,case when p_approve then 'in_progress' else 'diagnosing' end,p_reason,p_idempotency_key);
  return jsonb_build_object('approved',p_approve,'approvedTotalMinor',case when p_approve then change.revised_total_minor else job.approved_total_minor end);
end $$;

create function public.request_account_deletion(p_reauthentication_token text default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); request_id uuid; issued bigint;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  issued:=coalesce((auth.jwt()->>'iat')::bigint,0); if extract(epoch from now())::bigint-issued>600 then raise exception 'RECENT_REAUTHENTICATION_REQUIRED'; end if;
  insert into account_deletion_requests(user_id,verified_at) values(actor,now()) returning id into request_id;
  update profiles set status='deletion_pending' where id=actor;
  delete from push_tokens where user_id=actor;
  insert into scheduled_jobs(job_type,payload,scheduled_at) values('account_deletion',jsonb_build_object('requestId',request_id,'userId',actor),now());
  return request_id;
end $$;
create function public.request_data_export(p_reauthentication_token text default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$ declare result uuid; begin if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if; insert into data_export_requests(user_id) values(auth.uid()) returning id into result; insert into scheduled_jobs(job_type,payload,scheduled_at) values('data_export',jsonb_build_object('requestId',result,'userId',auth.uid()),now()); return result; end $$;
create function public.request_external_account_deletion(p_email text,p_reason text default null) returns void
language plpgsql security definer set search_path=public,extensions,pg_temp as $$ begin if p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'INVALID_REQUEST'; end if; insert into external_privacy_requests(email_hash,request_type,reason) values(encode(digest(lower(trim(p_email)),'sha256'),'hex'),'deletion',left(p_reason,1000)); end $$;

create function public.admin_marketplace_health() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return jsonb_build_object(
    'new_requests',(select count(*) from service_requests where created_at>now()-interval '24 hours'),
    'active_jobs',(select count(*) from jobs where status not in ('completed','cancelled','disputed')),
    'open_support_cases',(select count(*) from support_cases where status not in ('resolved','closed')),
    'open_disputes',(select count(*) from disputes where status not in ('resolved','closed')),
    'pending_verifications',(select count(*) from provider_profiles where verification_status in ('submitted','under_review')),
    'notification_failures',(select count(*) from notification_outbox where status in ('failed','dead_letter')),
    'financial_holds',(select count(*) from financial_holds where status='held'));
end $$;

revoke all on function public.run_matching(uuid,integer) from public,anon,authenticated;
grant execute on function public.publish_service_request(jsonb),public.submit_offer(jsonb),public.select_offer(uuid,text),public.transition_job(uuid,text,text,text),
  public.create_change_order(jsonb),public.decide_change_order(uuid,boolean,text,text),public.request_account_deletion(text),public.request_data_export(text),public.admin_marketplace_health() to authenticated;
grant execute on function public.request_external_account_deletion(text,text) to anon,authenticated;

commit;
