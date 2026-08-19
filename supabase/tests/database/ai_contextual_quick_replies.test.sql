begin;
select plan(2);

select is(
  (select count(*) from public.ai_prompt_versions
   where purpose='diagnostic' and enabled),
  1::bigint,
  'exactly one diagnostic prompt version is active'
);

select is(
  (select version from public.ai_prompt_versions
   where purpose='diagnostic' and enabled),
  'diagnostic-v4',
  'the contextual quick-reply prompt contract is active'
);

select * from finish();
rollback;
