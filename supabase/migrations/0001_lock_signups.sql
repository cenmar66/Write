-- Write.ai is a single-user app. This blocks every sign-up except the owner's,
-- at the database level, no matter how someone tries to get in.
create or replace function public.only_owner_can_sign_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) <> 'cenmarf@gmail.com' then
    raise exception 'Sign-ups are closed.';
  end if;
  return new;
end;
$$;

drop trigger if exists only_owner_can_sign_up on auth.users;
create trigger only_owner_can_sign_up
  before insert on auth.users
  for each row execute function public.only_owner_can_sign_up();
