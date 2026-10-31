-- Behaviour tests for 0011_promptdojo.sql. Run with: npm run test:sql
\set ON_ERROR_STOP 1
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'me@example.com'),
                              ('22222222-2222-2222-2222-222222222222', 'other@example.com')
  on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- 1. A prompt with two versions: numbers assigned by the database, current copy kept.
insert into public.dojo_collections (id, name) values ('cccccccc-0000-0000-0000-000000000001', 'Marketing');
insert into public.dojo_prompts (id, title, target_model, collection_id)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'Campaign', 'claude', 'cccccccc-0000-0000-0000-000000000001');
insert into public.dojo_prompt_versions (id, prompt_id, version_no, content, kind)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 99, 'first', 'generated');
insert into public.dojo_prompt_versions (id, prompt_id, version_no, content, kind, parent_version_id)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 0, 'second', 'refined', 'bbbbbbbb-0000-0000-0000-000000000001');
do $$ begin
  assert (select array_agg(version_no order by version_no) from public.dojo_prompt_versions) = array[1, 2], 'version numbers';
  assert (select current_content from public.dojo_prompts) = 'second', 'current copy';
  assert (select current_version_no from public.dojo_prompts) = 2, 'current number';
end $$;

-- 2. Versions are immutable: users have no update policy (0 rows change)...
update public.dojo_prompt_versions set content = 'tampered' where version_no = 1;
do $$ begin assert (select content from public.dojo_prompt_versions where version_no = 1) = 'first', 'version edited'; end $$;
-- ...and even the database owner is stopped by the trigger.
reset role;
do $$ begin
  update public.dojo_prompt_versions set content = 'tampered' where version_no = 1;
  raise exception 'should have failed';
exception when others then
  if sqlerrm not like '%immutable%' then raise; end if;
end $$;
set role authenticated;
-- ...and users have no delete policy on them (silently affects 0 rows).
delete from public.dojo_prompt_versions;
do $$ begin assert (select count(*) from public.dojo_prompt_versions) = 2, 'versions deleted'; end $$;

-- 3. Another user sees nothing and can't attach to my rows.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from public.dojo_prompts) = 0, 'other user sees my prompts';
  assert (select count(*) from public.dojo_prompt_versions) = 0, 'other user sees my versions';
  assert (select count(*) from public.dojo_collections) = 0, 'other user sees my collections';
end $$;
do $$ begin
  insert into public.dojo_prompt_versions (prompt_id, version_no, content, kind)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 0, 'intrusion', 'edited');
  raise exception 'should have failed';
exception when others then
  if sqlerrm not like '%row-level security%' and sqlerrm not like 'Prompt not found%' then raise; end if;
end $$;
do $$ begin
  insert into public.dojo_prompts (title, target_model, collection_id)
    values ('Mine', 'universal', 'cccccccc-0000-0000-0000-000000000001');
  raise exception 'should have failed';
exception when others then
  if sqlerrm not like '%row-level security%' then raise; end if;
end $$;
update public.dojo_prompts set title = 'hijacked';
delete from public.dojo_prompts;

-- 4. Users can't write the credit ledger.
do $$ begin
  insert into public.dojo_credit_ledger (user_id, delta, reason, idempotency_key)
    values ('22222222-2222-2222-2222-222222222222', 1000, 'grant', 'free-money');
  raise exception 'should have failed';
exception when others then
  if sqlerrm not like '%row-level security%' then raise; end if;
end $$;

-- 5. Back as the owner: nothing was changed by the other user.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  assert (select title from public.dojo_prompts) = 'Campaign', 'other user changed my prompt';
end $$;

-- 6. Tags link only to my prompts; usage is recorded.
insert into public.dojo_tags (id, name) values ('dddddddd-0000-0000-0000-000000000001', 'email');
insert into public.dojo_prompt_tags (prompt_id, tag_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001');
insert into public.dojo_usage (kind, provider, model, input_tokens, output_tokens, cost_usd) values ('generate', 'anthropic', 'claude-opus-5-5', 1000, 500, 0.014);

-- 7. Retention keeps recent rows; deleting a prompt cascades its versions cleanly.
insert into public.dojo_generations (request, target_model, provider, model, meta_prompt_version, schema_version, result)
  values ('old', 'universal', 'mock', 'mock-1', 'generate.v1', 'dojo.generation.v1', '{}');
do $$ begin assert public.dojo_apply_retention(30) = 0, 'retention removed a new row'; end $$;
delete from public.dojo_prompts where id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin assert (select count(*) from public.dojo_prompt_versions) = 0, 'versions should cascade'; end $$;

-- 8. Delete all my data.
select public.dojo_delete_my_data();
do $$ begin
  assert (select count(*) from public.dojo_usage) = 0, 'usage left behind';
  assert (select count(*) from public.dojo_generations) = 0, 'generations left behind';
  assert (select count(*) from public.dojo_collections) = 0, 'collections left behind';
end $$;
reset role;
\echo 'dojo SQL tests passed'
