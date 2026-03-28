-- ── Enable pgvector ────────────────────────────────────────────────────────────
create extension if not exists vector;

-- ── Reels table ─────────────────────────────────────────────────────────────────
create table if not exists reels (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  url           text not null,
  video_id      text,
  transcription text not null default '',
  embedding     vector(384),           -- all-MiniLM-L6-v2 output dim
  created_at    timestamptz not null default now()
);

-- Prevent duplicate URLs per user
create unique index if not exists reels_user_url_idx on reels (user_id, url);

-- HNSW index for fast cosine similarity search
create index if not exists reels_embedding_idx
  on reels using hnsw (embedding vector_cosine_ops);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table reels enable row level security;

-- Users can only see / modify their own rows
-- (backend uses service key so it bypasses RLS, but this protects direct API access)
create policy "reels_select_own" on reels for select using (auth.uid() = user_id);
create policy "reels_insert_own" on reels for insert with check (auth.uid() = user_id);
create policy "reels_delete_own" on reels for delete using (auth.uid() = user_id);

-- ── RPC for vector search ─────────────────────────────────────────────────────
create or replace function search_reels(
  query_user_id  uuid,
  query_embedding vector(384),
  match_count     int default 5
)
returns table (
  id            uuid,
  url           text,
  video_id      text,
  transcription text,
  similarity    float,
  created_at    timestamptz
)
language sql stable
as $$
  select
    r.id,
    r.url,
    r.video_id,
    r.transcription,
    1 - (r.embedding <=> query_embedding) as similarity,
    r.created_at
  from reels r
  where r.user_id = query_user_id
    and r.embedding is not null
  order by r.embedding <=> query_embedding
  limit match_count;
$$;
