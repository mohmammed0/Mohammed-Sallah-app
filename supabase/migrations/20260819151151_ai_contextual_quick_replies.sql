-- Activate the diagnostic-v4 structured contract. The Edge Function requires
-- this exact enabled version before invoking any external AI provider.
update public.ai_prompt_versions
set enabled=false
where purpose='diagnostic' and enabled;

insert into public.ai_prompt_versions(
  purpose,version,schema_version,system_prompt_hash,enabled
) values(
  'diagnostic',
  'diagnostic-v4',
  '1.0',
  encode(
    extensions.digest('diagnostic-v4-contextual-quick-replies','sha256'),
    'hex'
  ),
  true
);
