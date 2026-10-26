-- PeopleFlow: one company/workspace per Supabase project.
-- Run in Supabase SQL Editor as the project owner. Safe to rerun.
-- Auth users and role assignments are created by the owner, not public signup.
begin;
create schema if not exists peopleflow_private;
revoke all on schema peopleflow_private from public, anon, authenticated;

create table if not exists public.pf_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'hr', 'employee')),
  employee_id text unique,
  display_name text not null default '',
  check (role <> 'employee' or nullif(employee_id, '') is not null)
);
alter table public.pf_profiles drop constraint if exists pf_profiles_check;
alter table public.pf_profiles add constraint pf_profiles_check check (role <> 'employee' or nullif(employee_id, '') is not null);
alter table public.pf_profiles drop constraint if exists pf_profiles_role_check;
alter table public.pf_profiles add constraint pf_profiles_role_check check (role in ('admin','hr','employee'));

create table if not exists public.pf_workspace (
  id integer primary key check (id = 1),
  revision bigint not null default 0,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.pf_profiles enable row level security;
alter table public.pf_workspace enable row level security;
revoke all on public.pf_profiles, public.pf_workspace from public, anon, authenticated;
grant select on public.pf_profiles to authenticated;
drop policy if exists pf_read_own_profile on public.pf_profiles;
create policy pf_read_own_profile on public.pf_profiles for select to authenticated
  using (user_id = (select auth.uid()));
-- No client table writes and no direct workspace SELECT, including for admins.
-- Only narrow RPC functions below expose data.

insert into public.pf_workspace(id, data) values (1, '{
  "company":"My Company", "employees":[], "attendance":[], "leaves":[],
  "payroll":[], "expenses":[], "recruitment":[], "performance":[], "activity":[],
  "settings":{"annualQuota":20,"casualQuota":10,"sickQuota":8,"shiftStart":"09:00","graceMinutes":15}
}'::jsonb) on conflict (id) do nothing;

create or replace function peopleflow_private.profile()
returns public.pf_profiles language plpgsql security definer set search_path = '' as $$
declare p public.pf_profiles;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  select * into p from public.pf_profiles where user_id = auth.uid();
  if not found then raise exception 'Your account has not been assigned a workspace role. Contact your administrator.'; end if;
  return p;
end $$;

create or replace function peopleflow_private.validate_workspace(d jsonb)
returns void language plpgsql set search_path = '' as $$
declare k text; r jsonb; n numeric;
begin
  if jsonb_typeof(d) is distinct from 'object' or nullif(trim(d->>'company'), '') is null
    or jsonb_typeof(d->'settings') is distinct from 'object' then
    raise exception 'Invalid workspace or company settings.';
  end if;
  foreach k in array array['employees','attendance','leaves','payroll','expenses','recruitment','performance','activity'] loop
    if jsonb_typeof(d->k) is distinct from 'array' then raise exception 'Invalid collection: %', k; end if;
    if exists (select 1 from jsonb_array_elements(d->k) x where jsonb_typeof(x) <> 'object' or nullif(x->>'id','') is null)
      or exists (select 1 from jsonb_array_elements(d->k) x group by x->>'id' having count(*) > 1) then
      raise exception 'Missing or duplicate record ID in %.', k;
    end if;
  end loop;
  foreach k in array array['annualQuota','casualQuota','sickQuota','graceMinutes'] loop
    n := coalesce((d->'settings'->>k)::numeric, case when k = 'graceMinutes' then 15 else null end);
    if n is null or n < 0 or n > 366 or n <> trunc(n) then raise exception 'Invalid setting: %', k; end if;
  end loop;
  perform coalesce(d->'settings'->>'shiftStart', '09:00')::time;
  if exists (select 1 from jsonb_array_elements(d->'employees') x group by lower(trim(x->>'email')) having count(*) > 1) then
    raise exception 'Employee emails must be unique.';
  end if;
  for r in select * from jsonb_array_elements(d->'employees') loop
    if nullif(trim(r->>'name'),'') is null or coalesce(r->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or jsonb_typeof(r->'salary') is distinct from 'number' or (r->>'salary')::numeric < 0
      or coalesce(r->>'status','') not in ('Active','On Leave','Inactive') then raise exception 'Invalid employee fields.'; end if;
    perform (r->>'joined')::date;
  end loop;
  foreach k in array array['attendance','leaves','payroll','expenses','performance'] loop
    if exists (select 1 from jsonb_array_elements(d->k) x where not exists (
      select 1 from jsonb_array_elements(d->'employees') e where e->>'id' = x->>'employeeId'
    )) then raise exception 'Unknown employee in %.', k; end if;
  end loop;
  -- Prevent deleting/renaming an employee while their Auth account is linked.
  if exists (select 1 from public.pf_profiles p where p.role = 'employee' and not exists (
    select 1 from jsonb_array_elements(d->'employees') e where e->>'id' = p.employee_id
  )) then raise exception 'Unlink the employee login before deleting its employee record.'; end if;
  if exists (select 1 from jsonb_array_elements(d->'attendance') x group by x->>'employeeId', x->>'date' having count(*) > 1) then
    raise exception 'Attendance already exists for this employee and date.';
  end if;
  for r in select * from jsonb_array_elements(d->'attendance') loop
    if coalesce(r->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(r->>'status','') not in ('Present','Late','Absent','On Leave') then
      raise exception 'Invalid attendance date or status.'; end if;
    perform (r->>'date')::date;
    if nullif(r->>'checkIn','') is not null then perform (r->>'checkIn')::time; end if;
    if nullif(r->>'checkOut','') is not null and (nullif(r->>'checkIn','') is null or (r->>'checkOut')::time < (r->>'checkIn')::time) then
      raise exception 'Check-out must follow check-in (same-day shifts).'; end if;
  end loop;
  for r in select * from jsonb_array_elements(d->'leaves') loop
    if coalesce(r->>'type','') not in ('Annual','Casual','Sick','Unpaid') or coalesce(r->>'status','') not in ('Pending','Approved','Rejected')
      or nullif(r->>'from','') is null or nullif(r->>'to','') is null
      or (r->>'to')::date < (r->>'from')::date or (r->>'to')::date - (r->>'from')::date > 365 then
      raise exception 'Invalid leave request (maximum 366 calendar days).'; end if;
    if not exists (select 1 from generate_series((r->>'from')::date, (r->>'to')::date, interval '1 day') day
      where extract(isodow from day) < 6) then raise exception 'Leave must include a workday.'; end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(d->'leaves') a join jsonb_array_elements(d->'leaves') b
    on a->>'employeeId' = b->>'employeeId' and a->>'id' < b->>'id'
    where a->>'status' in ('Pending','Approved') and b->>'status' in ('Pending','Approved')
      and (a->>'from')::date <= (b->>'to')::date and (b->>'from')::date <= (a->>'to')::date
  ) then raise exception 'Overlapping pending/approved leave requests are not allowed.'; end if;
  -- Pending requests reserve quota too; group by calendar year, including cross-year requests.
  if exists (
    select 1 from jsonb_array_elements(d->'leaves') l
    cross join lateral generate_series((l->>'from')::date, (l->>'to')::date, interval '1 day') day
    where l->>'status' in ('Pending','Approved') and l->>'type' <> 'Unpaid' and extract(isodow from day) < 6
    group by l->>'employeeId', l->>'type', extract(year from day)
    having count(*) > (d->'settings'->>(lower(l->>'type') || 'Quota'))::integer
  ) then raise exception 'Leave exceeds the available annual quota (including pending requests).'; end if;
  if exists (select 1 from jsonb_array_elements(d->'payroll') p group by p->>'employeeId', p->>'month' having count(*) > 1) then
    raise exception 'Payroll already exists for this employee and month.'; end if;
  for r in select * from jsonb_array_elements(d->'payroll') loop
    if coalesce(r->>'month','') !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid pay month.'; end if;
    foreach k in array array['base','allowance','deduction','net'] loop
      if jsonb_typeof(r->k) is distinct from 'number' or (r->>k)::numeric < 0 then raise exception 'Invalid payroll amount: %', k; end if;
    end loop;
    if abs((r->>'base')::numeric + (r->>'allowance')::numeric - (r->>'deduction')::numeric - (r->>'net')::numeric) > 0.005 then
      raise exception 'Payroll net does not match base plus allowances minus deductions.'; end if;
  end loop;
  for r in select * from jsonb_array_elements(d->'expenses') loop
    if jsonb_typeof(r->'amount') is distinct from 'number' or (r->>'amount')::numeric <= 0
      or coalesce(r->>'status','') not in ('Pending','Approved','Rejected') then raise exception 'Invalid expense.'; end if;
  end loop;
end $$;

create or replace function public.pf_get_workspace()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.pf_profiles; w public.pf_workspace; filtered jsonb; part jsonb; k text;
begin
  p := peopleflow_private.profile();
  select * into strict w from public.pf_workspace where id = 1;
  filtered := w.data;
  if p.role = 'employee' then
    if not exists (select 1 from jsonb_array_elements(w.data->'employees') e
      where e->>'id' = p.employee_id and e->>'status' <> 'Inactive') then raise exception 'Employee account is inactive or not linked.'; end if;
    foreach k in array array['employees','attendance','leaves','payroll','expenses','performance'] loop
      select coalesce(jsonb_agg(x), '[]'::jsonb) into part
      from jsonb_array_elements(w.data->k) x
      where case when k = 'employees' then x->>'id' else x->>'employeeId' end = p.employee_id;
      filtered := jsonb_set(filtered, array[k], part);
    end loop;
    filtered := filtered || '{"activity":[],"recruitment":[]}'::jsonb;
  end if;
  return jsonb_build_object('profile', to_jsonb(p), 'revision', w.revision, 'data', filtered);
end $$;

create or replace function public.pf_save_workspace(payload jsonb, expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.pf_profiles; w public.pf_workspace;
begin
  p := peopleflow_private.profile();
  if p.role not in ('admin','hr') then raise exception 'HR or administrator access required.'; end if;
  select * into strict w from public.pf_workspace where id = 1 for update;
  if w.revision <> expected_revision then raise exception 'Records changed in another session. Refresh and try again.'; end if;
  if p.role = 'hr' and (payload->'company' is distinct from w.data->'company' or payload->'settings' is distinct from w.data->'settings') then
    raise exception 'Only administrators can change company settings.';
  end if;
  perform peopleflow_private.validate_workspace(payload);
  update public.pf_workspace set data = payload, revision = revision + 1, updated_at = now() where id = 1;
  return public.pf_get_workspace();
end $$;

create or replace function public.pf_request_leave(leave_type text, from_date date, to_date date, reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.pf_profiles; w public.pf_workspace; r jsonb;
begin
  p := peopleflow_private.profile();
  if p.role <> 'employee' then raise exception 'Use the admin leave form.'; end if;
  perform public.pf_get_workspace();
  if from_date is null or to_date is null or from_date < (now() at time zone 'Asia/Karachi')::date then raise exception 'Choose today or a future date.'; end if;
  select * into strict w from public.pf_workspace where id = 1 for update;
  r := jsonb_build_object('id', gen_random_uuid()::text, 'employeeId', p.employee_id, 'type', leave_type,
    'from', from_date, 'to', to_date, 'reason', left(coalesce(reason,''),1000), 'status','Pending');
  w.data := jsonb_set(w.data, '{leaves}', w.data->'leaves' || jsonb_build_array(r));
  perform peopleflow_private.validate_workspace(w.data);
  update public.pf_workspace set data = w.data, revision = revision + 1, updated_at = now() where id = 1;
  return public.pf_get_workspace();
end $$;

create or replace function public.pf_punch(direction text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.pf_profiles; w public.pf_workspace; r jsonb; stamp timestamp := now() at time zone 'Asia/Karachi'; day text; idx integer; late_at time;
begin
  p := peopleflow_private.profile();
  if p.role <> 'employee' then raise exception 'Employee access required.'; end if;
  perform public.pf_get_workspace();
  day := to_char(stamp, 'YYYY-MM-DD');
  select * into strict w from public.pf_workspace where id = 1 for update;
  select (ordinality - 1)::integer, value into idx, r from jsonb_array_elements(w.data->'attendance') with ordinality
    where value->>'employeeId' = p.employee_id and value->>'date' = day;
  if direction = 'in' then
    if r is not null then raise exception 'Attendance already exists for today. Contact HR for corrections.'; end if;
    if exists (select 1 from jsonb_array_elements(w.data->'leaves') l where l->>'employeeId' = p.employee_id
      and l->>'status' = 'Approved' and day between l->>'from' and l->>'to') then raise exception 'You are on approved leave today.'; end if;
    late_at := coalesce(w.data->'settings'->>'shiftStart','09:00')::time + make_interval(mins => coalesce((w.data->'settings'->>'graceMinutes')::integer,15));
    r := jsonb_build_object('id',gen_random_uuid()::text,'employeeId',p.employee_id,'date',day,
      'status',case when stamp::time > late_at then 'Late' else 'Present' end,
      'checkIn',to_char(stamp,'HH24:MI'),'checkOut','', 'checkInAt',now());
    w.data := jsonb_set(w.data, '{attendance}', w.data->'attendance' || jsonb_build_array(r));
  elsif direction = 'out' then
    if r is null or nullif(r->>'checkIn','') is null then raise exception 'Check in first.'; end if;
    if nullif(r->>'checkOut','') is not null then raise exception 'Already checked out.'; end if;
    r := r || jsonb_build_object('checkOut',to_char(stamp,'HH24:MI'),'checkOutAt',now());
    w.data := jsonb_set(w.data, array['attendance',idx::text],r);
  else raise exception 'Invalid attendance action.';
  end if;
  update public.pf_workspace set data = w.data, revision = revision + 1, updated_at = now() where id = 1;
  return public.pf_get_workspace();
end $$;

create or replace function public.pf_set_access(account_email text, account_role text, linked_employee_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.pf_profiles; target uuid; w public.pf_workspace;
begin
  p := peopleflow_private.profile();
  if p.role <> 'admin' then raise exception 'Only administrators can manage login roles.'; end if;
  if account_role not in ('admin','hr','employee') or account_role is null then raise exception 'Invalid role.'; end if;
  select id into target from auth.users where lower(email) = lower(trim(account_email));
  if target is null then raise exception 'Create this user in Supabase Authentication first.'; end if;
  if target = auth.uid() and account_role <> 'admin' then raise exception 'You cannot remove your own administrator access.'; end if;
  select * into strict w from public.pf_workspace where id = 1 for update;
  if account_role = 'employee' and not exists (
    select 1 from jsonb_array_elements(w.data->'employees') e where e->>'id' = linked_employee_id
    and lower(e->>'email') = lower(trim(account_email)) and e->>'status' <> 'Inactive'
  ) then raise exception 'Choose an active employee whose work email matches this login.'; end if;
  insert into public.pf_profiles(user_id, role, employee_id, display_name)
  values (target, account_role, case when account_role = 'employee' then linked_employee_id end, trim(account_email))
  on conflict (user_id) do update set role = excluded.role, employee_id = excluded.employee_id, display_name = excluded.display_name;
  update public.pf_workspace set revision = revision + 1, updated_at = now() where id = 1;
end $$;

create or replace function public.pf_revoke_access(account_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.pf_profiles; target uuid;
begin
  p := peopleflow_private.profile();
  if p.role <> 'admin' then raise exception 'Only administrators can revoke access.'; end if;
  select id into target from auth.users where lower(email) = lower(trim(account_email));
  if target is null then raise exception 'User not found.'; end if;
  if target = auth.uid() then raise exception 'You cannot revoke your own access.'; end if;
  perform 1 from public.pf_workspace where id = 1 for update;
  delete from public.pf_profiles where user_id = target;
  update public.pf_workspace set revision = revision + 1, updated_at = now() where id = 1;
end $$;

create or replace function public.pf_list_access()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.pf_profiles; result jsonb;
begin
  p := peopleflow_private.profile();
  if p.role <> 'admin' then raise exception 'Only administrators can view login roles.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('email', u.email, 'role', r.role, 'employeeId', r.employee_id) order by u.email), '[]'::jsonb)
    into result from public.pf_profiles r join auth.users u on u.id = r.user_id;
  return result;
end $$;

revoke all on all functions in schema peopleflow_private from public, anon, authenticated;
revoke all on function public.pf_get_workspace(), public.pf_save_workspace(jsonb,bigint),
  public.pf_request_leave(text,date,date,text), public.pf_punch(text),
  public.pf_set_access(text,text,text), public.pf_revoke_access(text), public.pf_list_access() from public, anon, authenticated;
grant execute on function public.pf_get_workspace(), public.pf_save_workspace(jsonb,bigint),
  public.pf_request_leave(text,date,date,text), public.pf_punch(text),
  public.pf_set_access(text,text,text), public.pf_revoke_access(text), public.pf_list_access() to authenticated;
commit;
