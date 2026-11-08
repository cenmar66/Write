-- Behaviour tests for 0016_satori_costs.sql. Run with: npm run test:sql
\set ON_ERROR_STOP 1
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'me@example.com') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.satori_preferences (monthly_budget_usd, alert_percent, model_prices)
  values (12.5, 75, '{"openai:gpt-x": {"input": 1.25, "output": 10}}')
  on conflict (user_id) do update set monthly_budget_usd = excluded.monthly_budget_usd, alert_percent = excluded.alert_percent, model_prices = excluded.model_prices;
do $$ begin
  assert (select monthly_budget_usd from public.satori_preferences) = 12.5, 'budget not stored';
  assert (select model_prices->'openai:gpt-x'->>'output' from public.satori_preferences) = '10', 'prices not stored';
end $$;
do $$ begin
  update public.satori_preferences set alert_percent = 0;
  raise exception 'should have failed';
exception when check_violation then null;
end $$;
do $$ begin
  update public.satori_preferences set model_prices = '[1,2]';
  raise exception 'should have failed';
exception when check_violation then null;
end $$;
select public.satori_delete_my_data();
reset role;
\echo 'satori cost SQL tests passed'
