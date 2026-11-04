-- 0014: post folders + social analytics. Owner-only, and re-runnable.
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001', 'cenmarf@gmail.com') on conflict do nothing;
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000002', 'someone@test') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);

insert into public.folders (name) values ('Launch week');
insert into public.posts (platform, content, folder_id, external_id)
  values ('instagram', 'Hello', (select id from public.folders where name = 'Launch week'), '1789');
insert into public.social_items (platform, external_id, post_id, text, views, likes, comments)
  values ('instagram', '1789', (select id from public.posts limit 1), 'Hello', 1200, 80, 2);
insert into public.social_comments (item_id, platform, external_id, author, text)
  values ((select id from public.social_items limit 1), 'instagram', 'c1', 'fan', 'Love this');
insert into public.social_account_stats (platform, day, followers) values ('instagram', current_date, 5400);
-- the same item again updates instead of duplicating
insert into public.social_items (platform, external_id, text, views)
  values ('instagram', '1789', 'Hello', 1500)
  on conflict (user_id, platform, external_id) do update set views = excluded.views;

do $$ begin
  if (select count(*) from public.posts where folder_id is not null) <> 1 then raise exception 'post folder not saved'; end if;
  if (select views from public.social_items) <> 1500 then raise exception 'upsert did not update'; end if;
  if (select count(*) from public.social_comments) <> 1 then raise exception 'comment missing'; end if;
end $$;

-- deleting the folder keeps the post
delete from public.folders where name = 'Launch week';
do $$ begin
  if (select count(*) from public.posts) <> 1 then raise exception 'post was deleted with its folder'; end if;
end $$;

-- someone else sees nothing and can't write into my items
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', false);
do $$ begin
  if (select count(*) from public.social_items) + (select count(*) from public.social_comments)
     + (select count(*) from public.social_account_stats) <> 0 then raise exception 'analytics leaked to another user'; end if;
end $$;
do $$ begin
  begin
    insert into public.social_items (user_id, platform, external_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'evil');
    raise exception 'wrote into another user''s analytics';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'analytics SQL tests passed';
