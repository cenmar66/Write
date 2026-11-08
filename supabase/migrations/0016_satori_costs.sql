-- PromptSatori: personal budget, budget warning and prices for models without built-in
-- prices (e.g. OpenAI and Gemini models). Safe to run more than once. Never deletes data.
-- Needs 0011_promptsatori.sql first.

alter table public.satori_preferences add column if not exists monthly_budget_usd numeric(10, 2);
alter table public.satori_preferences add column if not exists alert_percent integer not null default 80;
-- {"openai:model-id": {"input": 1.25, "output": 10}, ...} in USD per million tokens.
alter table public.satori_preferences add column if not exists model_prices jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.satori_preferences add constraint satori_preferences_budget_check check (monthly_budget_usd is null or monthly_budget_usd between 0 and 100000);
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.satori_preferences add constraint satori_preferences_alert_check check (alert_percent between 1 and 100);
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.satori_preferences add constraint satori_preferences_prices_check check (jsonb_typeof(model_prices) = 'object' and pg_column_size(model_prices) < 20000);
exception when duplicate_object then null;
end $$;
