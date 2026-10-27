-- Behaviour tests for 0009_daily_canvas.sql. Run with: npm run test:sql
\set ON_ERROR_STOP 1
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'me@example.com'),
                              ('22222222-2222-2222-2222-222222222222', 'other@example.com');
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

-- 1. Create a task + note through canvas_push.
select jsonb_path_query(canvas_push('[
  {"table":"canvas_tasks","id":"aaaaaaaa-0000-0000-0000-000000000001","create":true,
   "patch":{"section":"must","title":"Write report","origin_date":"2026-10-27"}},
  {"table":"canvas_notes","id":"aaaaaaaa-0000-0000-0000-0000000000a1","create":true,
   "patch":{"date":"2026-10-27","body":"hello"}}
]'::jsonb), '$[*].status');

-- 2. Same create again (second device / retried request) does not duplicate.
select canvas_push('[{"table":"canvas_tasks","id":"aaaaaaaa-0000-0000-0000-000000000001","create":true,
   "patch":{"section":"must","title":"Write report","origin_date":"2026-10-27"}}]'::jsonb) is not null;
do $$ begin
  assert (select count(*) from public.canvas_tasks) = 1, 'duplicate task';
  assert (select version from public.canvas_tasks) = 2, 'version should bump on the replayed write';
end $$;

-- 3. Device A edits the note based on "hello"; server now has "hello"; ok.
select jsonb_path_query(canvas_push('[{"table":"canvas_notes","id":"aaaaaaaa-0000-0000-0000-0000000000a1",
  "patch":{"body":"hello from A"},"base":{"body":"hello"}}]'::jsonb), '$[*].status');
-- Device B (offline, still thinks body is "hello") edits it: conflict, server text kept.
select jsonb_path_query(canvas_push('[{"table":"canvas_notes","id":"aaaaaaaa-0000-0000-0000-0000000000a1",
  "patch":{"body":"hello from B"},"base":{"body":"hello"}}]'::jsonb), '$[*].status');
do $$ begin
  assert (select body from public.canvas_notes) = 'hello from A', 'conflict must not overwrite';
end $$;

-- 4. Second note for the same day with a different id is rejected (one per day).
select jsonb_path_query(canvas_push('[{"table":"canvas_notes","id":"aaaaaaaa-0000-0000-0000-0000000000a2","create":true,
   "patch":{"date":"2026-10-27","body":"dupe"}}]'::jsonb), '$[*].status');

-- 5. Unknown table is refused.
do $$ begin
  perform canvas_push('[{"table":"documents","id":"aaaaaaaa-0000-0000-0000-000000000009","patch":{}}]'::jsonb);
  raise exception 'should have failed';
exception when others then
  if sqlerrm not like 'Unknown table%' then raise; end if;
end $$;

-- 6. Ledger rows can't be edited.
select canvas_push('[{"table":"canvas_task_events","id":"aaaaaaaa-0000-0000-0000-0000000000e1","create":true,
  "patch":{"task_id":"aaaaaaaa-0000-0000-0000-000000000001","kind":"completed","at":"2026-10-27T17:00:00Z","local_date":"2026-10-27"}}]'::jsonb) is not null;
select canvas_push('[{"table":"canvas_task_events","id":"aaaaaaaa-0000-0000-0000-0000000000e1",
  "patch":{"kind":"reopened"}}]'::jsonb) is not null;
do $$ begin
  assert (select kind from public.canvas_task_events) = 'completed', 'ledger changed';
end $$;

-- 7. Another account sees nothing and cannot write into my rows.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
do $$ begin
  assert (select count(*) from public.canvas_tasks) = 0, 'RLS leak';
  assert (select count(*) from public.canvas_notes) = 0, 'RLS leak';
end $$;
do $$ begin
  -- My task id from their account: invisible to them, so it looks new, and the insert collides.
  perform canvas_push('[{"table":"canvas_tasks","id":"aaaaaaaa-0000-0000-0000-000000000001",
     "patch":{"title":"hijack","section":"must","origin_date":"2026-10-27"}}]'::jsonb);
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
do $$ begin
  assert (select title from public.canvas_tasks) = 'Write report', 'cross-account overwrite';
end $$;

-- 8. sync_seq always increases.
do $$ declare a bigint; b bigint; begin
  select sync_seq into a from public.canvas_tasks;
  perform canvas_push('[{"table":"canvas_tasks","id":"aaaaaaaa-0000-0000-0000-000000000001","patch":{"status":"done"}}]'::jsonb);
  select sync_seq into b from public.canvas_tasks;
  assert b > a, 'sync_seq did not advance';
end $$;

-- 9. Delete-my-data clears everything for me.
select canvas_delete_my_data();
do $$ begin
  assert (select count(*) from public.canvas_tasks) = 0, 'not deleted';
  assert (select count(*) from public.canvas_task_events) = 0, 'events not deleted';
end $$;
reset role;
select 'ALL SQL TESTS PASSED';
