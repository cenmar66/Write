-- Phase 2: documents, folders, version history, and per-document AI chat.
-- Every row belongs to the signed-in user, and row-level security makes sure
-- nothing can be read or written by anyone else.

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  folder_id uuid references public.folders on delete set null,
  title text not null default '',
  content jsonb not null default '{}'::jsonb,
  content_text text not null default '',
  word_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_user_updated on public.documents (user_id, updated_at desc);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  document_id uuid not null references public.documents on delete cascade,
  label text not null,
  title text not null default '',
  content jsonb not null,
  content_text text not null default '',
  created_at timestamptz not null default now()
);
create index document_versions_doc on public.document_versions (document_id, created_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  document_id uuid not null references public.documents on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index chat_messages_doc on public.chat_messages (document_id, created_at);

-- Row-level security: you can only ever touch your own rows.
do $$
declare t text;
begin
  foreach t in array array['folders', 'documents', 'document_versions', 'chat_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner only" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end $$;
