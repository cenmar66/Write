-- Behaviour tests for 0015_satori_connectors.sql. Run with: npm run test:sql
\set ON_ERROR_STOP 1
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'me@example.com'),
                              ('22222222-2222-2222-2222-222222222222', 'other@example.com')
  on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- 1. Add a connector; names are unique per user.
insert into public.satori_connectors (label, server_name, url, token_encrypted) values ('Notion', 'notion', 'https://mcp.example.com/mcp', 'v1.x.y.z');
do $$ begin
  insert into public.satori_connectors (label, server_name, url) values ('Notion 2', 'notion', 'https://mcp.example.com/other');
  raise exception 'should have failed';
exception when unique_violation then null;
end $$;

-- 2. Only https, and safe server names.
do $$ begin
  insert into public.satori_connectors (label, server_name, url) values ('Plain', 'plain', 'http://mcp.example.com');
  raise exception 'should have failed';
exception when check_violation then null;
end $$;
do $$ begin
  insert into public.satori_connectors (label, server_name, url) values ('Bad', 'Bad Name!', 'https://mcp.example.com');
  raise exception 'should have failed';
exception when check_violation then null;
end $$;

-- 3. Another user sees and changes nothing.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin assert (select count(*) from public.satori_connectors) = 0, 'other user sees my connectors'; end $$;
update public.satori_connectors set url = 'https://evil.example.com';
delete from public.satori_connectors;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin assert (select url from public.satori_connectors) = 'https://mcp.example.com/mcp', 'other user changed my connector'; end $$;

-- 4. Test runs record their context; delete-my-data removes connectors.
insert into public.satori_test_runs (prompt_text, provider, model, output, context) values ('p', 'mock', 'mock-1', 'o', '{"images":1,"webSearch":true}');
do $$ begin assert (select context->>'images' from public.satori_test_runs) = '1', 'context not stored'; end $$;
select public.satori_delete_my_data();
do $$ begin assert (select count(*) from public.satori_connectors) = 0, 'connectors left behind'; end $$;
reset role;
\echo 'satori connector SQL tests passed'
