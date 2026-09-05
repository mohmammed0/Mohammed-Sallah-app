begin;

-- PostgREST implements the idempotent Edge insert with
-- ON CONFLICT(file_upload_id) DO NOTHING. PostgreSQL requires SELECT on the
-- conflict-target column even though the request returns no media rows.
-- Keep the service role scoped to that single opaque identifier rather than
-- granting table-wide reads of message linkage or media kind.
revoke select on table public.ai_message_media from service_role;
grant select(file_upload_id) on table public.ai_message_media to service_role;

commit;
