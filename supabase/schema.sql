-- טיסות: רדאר הזדמנויות. כל הטבלאות בקידומת tisot_. קריאה פתוחה, כתיבה רק דרך פונקציות.

create table if not exists tisot_dests (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  he text not null, en text not null, country text not null,
  lat double precision not null, lng double precision not null,
  active boolean not null default false
);

create table if not exists tisot_prices (
  dest text not null references tisot_dests(code),
  nights int not null check (nights between 1 and 14),
  out_day date not null, back_day date not null,
  price numeric not null,
  scanned_at timestamptz not null default now(),
  primary key (dest, nights, out_day)
);

create table if not exists tisot_chunks (
  dest text not null references tisot_dests(code),
  nights int not null, idx int not null,
  scanned_at timestamptz, rows int, state text,
  primary key (dest, nights, idx)
);

create table if not exists tisot_state (
  id int primary key default 1 check (id = 1),
  blocked_until timestamptz, last_run timestamptz, last_note text
);
insert into tisot_state(id) values (1) on conflict do nothing;

create table if not exists tisot_guides (
  dest text primary key references tisot_dests(code),
  data jsonb not null, model text, created_at timestamptz not null default now()
);

create table if not exists tisot_trips (
  id uuid primary key default gen_random_uuid(),
  dest text not null references tisot_dests(code),
  out_day date not null, back_day date not null,
  price numeric, note text not null default '',
  created_at timestamptz not null default now(), deleted_at timestamptz
);

alter table tisot_dests enable row level security;
alter table tisot_prices enable row level security;
alter table tisot_chunks enable row level security;
alter table tisot_state enable row level security;
alter table tisot_guides enable row level security;
alter table tisot_trips enable row level security;

do $$ declare t text; begin
  foreach t in array array['tisot_dests','tisot_prices','tisot_chunks','tisot_state','tisot_guides','tisot_trips'] loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select using (true)', t || '_read', t);
  end loop;
end $$;

-- שלושה אורכי שהייה, חמישה חלקים של 61 יום לכל יעד פעיל
create or replace function tisot_sync_chunks() returns void language sql security definer set search_path = public as $$
  insert into tisot_chunks(dest, nights, idx)
  select d.code, n, i from tisot_dests d, unnest(array[3,4,5]) n, generate_series(0,4) i
  where d.active on conflict do nothing;
$$;
revoke all on function tisot_sync_chunks() from public, anon, authenticated;

-- לוח ההזדמנויות: לכל יעד סטטיסטיקה, התאריכים הזולים והמחיר הזול בכל חודש
create or replace function tisot_board() returns jsonb language sql stable security definer set search_path = public as $$
  with p as (select * from tisot_prices where out_day > current_date),
  s as (
    select dest, min(price) lo, round(avg(price)) av,
           round(percentile_cont(0.5) within group (order by price)::numeric) med,
           max(price) hi, count(*) n, max(scanned_at) seen
    from p group by dest),
  r as (select p.*, row_number() over (partition by dest order by price, out_day) k from p),
  t as (
    select dest, jsonb_agg(jsonb_build_object('out', out_day, 'back', back_day, 'n', nights, 'p', price) order by k) deals
    from r where k <= 12 group by dest),
  m as (
    select dest, jsonb_object_agg(ym, lo) months
    from (select dest, to_char(out_day, 'YYYY-MM') ym, min(price) lo from p group by 1, 2) x group by dest)
  select jsonb_build_object(
    'now', now(),
    'state', (select to_jsonb(st) from tisot_state st),
    'dests', (
      select jsonb_agg(jsonb_build_object(
        'code', d.code, 'he', d.he, 'en', d.en, 'country', d.country, 'lat', d.lat, 'lng', d.lng, 'active', d.active,
        'lo', s.lo, 'av', s.av, 'med', s.med, 'hi', s.hi, 'n', s.n, 'seen', s.seen,
        'deals', coalesce(t.deals, '[]'::jsonb), 'months', coalesce(m.months, '{}'::jsonb)) order by d.he)
      from tisot_dests d left join s on s.dest = d.code left join t on t.dest = d.code left join m on m.dest = d.code),
    'trips', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.out_day), '[]'::jsonb)
      from (select id, dest, out_day, back_day, price, note, created_at from tisot_trips where deleted_at is null) x));
$$;

-- כל המחירים של יעד אחד, ללוח השנה שלו
create or replace function tisot_cal(p_dest text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(out_day, nights, price) order by out_day, nights), '[]'::jsonb)
  from tisot_prices where dest = p_dest and out_day > current_date;
$$;

-- מעקב אחרי יעד: מוסיף או מסיר אותו מהסריקה
create or replace function tisot_watch(p_dest text, p_on boolean) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from tisot_dests where code = p_dest) then return false; end if;
  if p_on and (select count(*) from tisot_dests where active) >= 40 then return false; end if;
  update tisot_dests set active = p_on where code = p_dest;
  if p_on then perform tisot_sync_chunks(); else delete from tisot_chunks where dest = p_dest; end if;
  return true;
end $$;

-- שמירת טיול: בדיקת כל שדה, והגבלת קצב של 30 בשעה
create or replace function tisot_save_trip(p_dest text, p_out date, p_back date, p_price numeric, p_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not exists (select 1 from tisot_dests where code = p_dest) then raise exception 'יעד לא מוכר'; end if;
  if p_out is null or p_back is null or p_back <= p_out or p_back - p_out > 30 or p_out < current_date then raise exception 'תאריכים לא תקינים'; end if;
  if p_price is not null and (p_price < 0 or p_price > 100000) then raise exception 'מחיר לא תקין'; end if;
  if (select count(*) from tisot_trips where created_at > now() - interval '1 hour') >= 30 then raise exception 'יותר מדי שמירות בשעה'; end if;
  select id into v from tisot_trips where dest = p_dest and out_day = p_out and back_day = p_back and deleted_at is null;
  if v is not null then return v; end if;
  insert into tisot_trips(dest, out_day, back_day, price, note)
  values (p_dest, p_out, p_back, p_price, left(coalesce(p_note, ''), 500)) returning id into v;
  return v;
end $$;

create or replace function tisot_remove_trip(p_id uuid) returns void language sql security definer set search_path = public as $$
  update tisot_trips set deleted_at = now() where id = p_id and deleted_at is null;
$$;

grant execute on function tisot_board(), tisot_cal(text), tisot_watch(text, boolean),
  tisot_save_trip(text, date, date, numeric, text), tisot_remove_trip(uuid) to anon, authenticated;

-- קליטת סריקה מהסורק (scripts/scan.py). בודקת כל שדה ומגבילה ל-400 חלקים בשעה.
create or replace function tisot_ingest(p_dest text, p_nights int, p_idx int, p_start date, p_end date, p_rows jsonb, p_state text)
returns int language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if not exists (select 1 from tisot_chunks where dest = p_dest and nights = p_nights and idx = p_idx) then raise exception 'חלק לא מוכר'; end if;
  if p_state not in ('ok', 'end', 'blocked') then raise exception 'מצב לא תקין'; end if;
  if p_start is null or p_end is null or p_start < current_date or p_start > current_date + 340 or p_end < p_start or p_end - p_start > 61 then raise exception 'טווח לא תקין'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 70 then raise exception 'שורות לא תקינות'; end if;
  if (select count(*) from tisot_chunks where scanned_at > now() - interval '1 hour') >= 400 then raise exception 'יותר מדי עדכונים בשעה'; end if;
  if p_state = 'ok' then
    delete from tisot_prices where dest = p_dest and nights = p_nights and out_day between p_start and p_end;
    insert into tisot_prices(dest, nights, out_day, back_day, price)
    select p_dest, p_nights, (x->>0)::date, (x->>0)::date + p_nights, (x->>2)::numeric
    from jsonb_array_elements(p_rows) x
    where (x->>0)::date between p_start and p_end and (x->>2)::numeric between 50 and 50000
    on conflict (dest, nights, out_day) do update set price = excluded.price, back_day = excluded.back_day, scanned_at = now();
    get diagnostics n = row_count;
  end if;
  update tisot_chunks set scanned_at = now(), rows = n, state = p_state where dest = p_dest and nights = p_nights and idx = p_idx;
  delete from tisot_prices where out_day <= current_date;
  update tisot_state set last_run = now(), last_note = p_state || ' ' || p_dest, blocked_until = null where id = 1;
  return n;
end $$;
grant execute on function tisot_ingest(text, int, int, date, date, jsonb, text) to anon, authenticated;
