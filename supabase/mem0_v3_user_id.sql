-- One-time migration for the mem0ai v3 upgrade (applied 2026-11-07).
--
-- mem0ai v3 scopes search by JSONB containment on metadata.user_id (snake_case).
-- Memories written by v2 only carried metadata.userId, so every v3 search returned
-- nothing. This copies userId -> user_id. Idempotent: rows that already have
-- user_id are untouched.
update memories
set metadata = metadata || jsonb_build_object('user_id', metadata->>'userId')
where metadata ? 'userId'
  and not (metadata ? 'user_id');
