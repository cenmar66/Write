-- 0014: folders for social posts, and social analytics (posts, stats, comments from your accounts).
-- Safe to run more than once. Never deletes data.

-- Posts can live in the same folders as documents.
alter table public.posts add column if not exists folder_id uuid references public.folders on delete set null;
create index if not exists posts_folder on public.posts (user_id, folder_id);

-- The id a platform gave a post we published, so its stats can be matched up.
alter table public.posts add column if not exists external_id text;

-- Every post pulled from a connected account (published from Write.ai or not), with its latest numbers.
create table if not exists public.social_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  platform text not null check (platform in ('linkedin', 'facebook', 'instagram', 'threads', 'x')),
  external_id text not null,
  post_id uuid references public.posts on delete set null,
  permalink text,
  text text not null default '',
  media_type text,
  posted_at timestamptz,
  views integer,
  reach integer,
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  metrics_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, platform, external_id)
);
create index if not exists social_items_user_posted on public.social_items (user_id, posted_at desc);

-- Comments and replies on those posts.
create table if not exists public.social_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  item_id uuid not null references public.social_items on delete cascade,
  platform text not null,
  external_id text not null,
  author text not null default '',
  text text not null default '',
  like_count integer,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, platform, external_id)
);
create index if not exists social_comments_user_posted on public.social_comments (user_id, posted_at desc);

-- One follower count per account per day, for the trend line.
create table if not exists public.social_account_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  platform text not null,
  day date not null,
  followers integer,
  created_at timestamptz not null default now(),
  unique (user_id, platform, day)
);

do $$
declare t text;
begin
  foreach t in array array['social_items', 'social_comments', 'social_account_stats'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner only" on public.%I', t);
    execute format(
      'create policy "owner only" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;
