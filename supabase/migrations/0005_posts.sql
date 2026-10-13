-- Phase 5: social posts and your own custom templates.
-- The scheduling columns are used in Phase 6.

create table public.post_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  category text not null default 'mine',
  description text not null default '',
  structure text not null,
  example text not null default '',
  format text not null default 'single' check (format in ('single', 'thread', 'carousel')),
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  platform text not null check (platform in ('linkedin', 'x', 'threads', 'facebook', 'instagram')),
  format text not null default 'single' check (format in ('single', 'thread', 'carousel')),
  idea text not null default '',
  content text not null default '',
  parts jsonb not null default '[]'::jsonb,
  hashtags jsonb not null default '[]'::jsonb,
  template_key text,
  source_document_id uuid references public.documents on delete set null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  external_url text,
  error text,
  media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_user_status on public.posts (user_id, status, updated_at desc);
create index posts_scheduled on public.posts (status, scheduled_at) where status = 'scheduled';

do $$
declare t text;
begin
  foreach t in array array['post_templates', 'posts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner only" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end $$;
