-- Perf indexes: comment reads (getComments + realtime filters) and follower counts
-- both filter on columns the primary keys don't cover.

create index if not exists comments_comment_key_idx
  on public.comments (comment_key, created_at desc);

create index if not exists follows_followee_id_idx
  on public.follows (followee_id);
