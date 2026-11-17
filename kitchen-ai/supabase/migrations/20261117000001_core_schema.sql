-- Kitchen AI — Phase 1 database structure.
-- Plain-English summary:
--   profiles        one row per user: goal, targets, allergies, diet, skill, time
--   foods           the nutrition table (per 100 g), used to calculate macros on the server
--   recipes         every recipe ever generated (saved once, reused — that's the cache)
--   generation_cache  "these ingredients + these settings" -> the recipes we already made
--   saved_recipes   which recipes a user bookmarked
--   meal_logs       what a user ate today (so we know their remaining macros)
--   ai_usage_log    every AI call: who, which feature, which model, tokens, estimated cost
--   ai_settings     one row of knobs: AI on/off, global daily $ cap, per-user daily limits, scan model
-- Row Level Security (RLS) = database rules that decide what each signed-in user may read/write.


-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  goal text check (goal in ('cut', 'maintain', 'bulk', 'glp1')),
  sex text check (sex in ('male', 'female', 'other')),
  age int check (age between 13 and 100),
  height_cm numeric(5, 1) check (height_cm between 100 and 250),
  weight_kg numeric(5, 1) check (weight_kg between 30 and 350),
  activity text check (activity in ('low', 'moderate', 'high')),
  protein_target_g int check (protein_target_g between 20 and 400),
  calorie_target int check (calorie_target between 800 and 6000),
  diet text[] not null default '{}',
  allergies text[] not null default '{}',
  skill text check (skill in ('beginner', 'intermediate', 'advanced')),
  max_minutes int check (max_minutes between 5 and 180),
  units text not null default 'us' check (units in ('us', 'metric')),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- create an empty profile automatically when someone signs up
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- ───────────────────────── foods (nutrition table) ─────────────────────────
create table public.foods (
  id serial primary key,
  name text not null unique,
  aliases text[] not null default '{}',
  category text not null,
  kcal numeric not null,       -- all per 100 g
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  fiber_g numeric not null default 0,
  tags text[] not null default '{}',   -- allergens + diet flags: milk, egg, fish, shellfish, peanut, tree_nut, soy, wheat, gluten, sesame, meat, poultry, beef, pork, lamb, animal, coconut
  safety_class text check (safety_class in ('poultry', 'ground_meat', 'whole_meat', 'fish', 'egg')),
  source text not null
);
alter table public.foods enable row level security;
-- anyone signed in can read it (powers instant ingredient suggestions, costs no AI)
create policy "foods readable" on public.foods for select to authenticated using (true);

-- ───────────────────────── recipes ─────────────────────────
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete set null,
  source text not null check (source in ('fridge', 'video', 'seed', 'manual')),
  title text not null,
  summary text,
  servings int not null default 1 check (servings between 1 and 12),
  minutes int not null check (minutes between 1 and 600),
  difficulty text,
  ingredients jsonb not null,  -- [{name, grams, food_id, matched, kcal, protein_g, carbs_g, fat_g}]
  steps jsonb not null,        -- [{text, timer_seconds}]
  macros jsonb not null,       -- per serving {kcal, protein_g, carbs_g, fat_g}
  macros_estimated boolean not null default false,
  safety jsonb not null default '[]',  -- [{class, label, temp_f, temp_c, rest_minutes, text}]
  tags text[] not null default '{}',
  glp1_friendly boolean not null default false,
  source_url text,      -- Phase 2: original video
  creator_name text,    -- Phase 2: credit
  creator_url text,
  is_public boolean not null default false,  -- Phase 3: community feed
  created_at timestamptz not null default now()
);
create index recipes_owner_idx on public.recipes (owner_id);
alter table public.recipes enable row level security;
-- Generated/seed/video recipes contain no personal data, so any signed-in user may open one by id
-- (that's what lets the cache share them). Private manual recipes stay private.
create policy "read recipes" on public.recipes for select to authenticated
  using (is_public or owner_id = (select auth.uid()) or source in ('fridge', 'seed', 'video'));
-- no insert/update policy: only server functions (service role) create recipes in Phase 1

-- ───────────────────────── generation cache ─────────────────────────
create table public.generation_cache (
  cache_key text primary key,
  recipe_ids uuid[] not null,
  created_at timestamptz not null default now()
);
alter table public.generation_cache enable row level security; -- no policies: server only

-- ───────────────────────── saved recipes ─────────────────────────
create table public.saved_recipes (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
alter table public.saved_recipes enable row level security;
create policy "own saves read" on public.saved_recipes for select to authenticated using (user_id = (select auth.uid()));
create policy "own saves insert" on public.saved_recipes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own saves delete" on public.saved_recipes for delete to authenticated using (user_id = (select auth.uid()));

-- ───────────────────────── meal logs ─────────────────────────
create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid references public.recipes (id) on delete set null,
  title text not null,
  kcal int not null check (kcal between 0 and 5000),
  protein_g int not null check (protein_g between 0 and 500),
  carbs_g int not null default 0 check (carbs_g between 0 and 1000),
  fat_g int not null default 0 check (fat_g between 0 and 500),
  eaten_at timestamptz not null default now()
);
create index meal_logs_user_day_idx on public.meal_logs (user_id, eaten_at desc);
alter table public.meal_logs enable row level security;
create policy "own logs read" on public.meal_logs for select to authenticated using (user_id = (select auth.uid()));
create policy "own logs insert" on public.meal_logs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own logs delete" on public.meal_logs for delete to authenticated using (user_id = (select auth.uid()));

-- ───────────────────────── AI settings, usage log, limits ─────────────────────────
create table public.ai_settings (
  id int primary key default 1 check (id = 1),
  ai_enabled boolean not null default true,                 -- master switch
  global_daily_cap_usd numeric(10, 2) not null default 3.00, -- all users combined, per UTC day
  daily_limits jsonb not null default '{"scan": 15, "generate": 25}', -- per user, per UTC day
  scan_model text not null default 'claude-haiku-5-5' check (scan_model in ('claude-haiku-5-5', 'claude-sonnet-5-5')),
  updated_at timestamptz not null default now()
);
insert into public.ai_settings (id) values (1);
alter table public.ai_settings enable row level security; -- server only

create table public.ai_usage_log (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete set null, -- kept (anonymous) after account deletion so cost history stays correct
  feature text not null,           -- 'scan' | 'generate' | (Phase 2) 'import' ...
  model text,
  status text not null default 'pending' check (status in ('pending', 'ok', 'refusal', 'error', 'cached')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index ai_usage_user_day_idx on public.ai_usage_log (user_id, feature, created_at desc);
create index ai_usage_day_idx on public.ai_usage_log (created_at desc);
alter table public.ai_usage_log enable row level security; -- server only

-- Checks limits and reserves a slot in ONE step (so 5 taps at once can't sneak past the limit).
-- Returns {allowed, reason, log_id, used, limit}. Only server functions may call it.
create function public.ai_reserve(p_user uuid, p_feature text, p_model text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.ai_settings;
  v_limit int;
  v_used int;
  v_spent numeric;
  v_id bigint;
begin
  select * into s from public.ai_settings where id = 1;
  if not s.ai_enabled then
    return jsonb_build_object('allowed', false, 'reason', 'ai_disabled');
  end if;

  -- serialize requests for this user+feature so the count is exact
  perform pg_advisory_xact_lock(hashtext(p_user::text || ':' || p_feature));

  select coalesce(sum(cost_usd), 0) into v_spent from public.ai_usage_log
    where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  if v_spent >= s.global_daily_cap_usd then
    return jsonb_build_object('allowed', false, 'reason', 'global_cap');
  end if;

  v_limit := coalesce((s.daily_limits ->> p_feature)::int, 0);
  select count(*) into v_used from public.ai_usage_log
    where user_id = p_user and feature = p_feature and status in ('pending', 'ok', 'refusal')
      and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  if v_used >= v_limit then
    return jsonb_build_object('allowed', false, 'reason', 'user_limit', 'used', v_used, 'limit', v_limit);
  end if;

  insert into public.ai_usage_log (user_id, feature, model, status) values (p_user, p_feature, p_model, 'pending')
    returning id into v_id;
  return jsonb_build_object('allowed', true, 'log_id', v_id, 'used', v_used + 1, 'limit', v_limit);
end $$;
revoke all on function public.ai_reserve(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ai_reserve(uuid, text, text) to service_role;

-- ───────────────────────── cost reports (run in Supabase SQL editor) ─────────────────────────
create view public.admin_usage_daily with (security_invoker = true) as
select (created_at at time zone 'utc')::date as day, feature, model,
       count(*) filter (where status in ('ok', 'refusal')) as ai_calls,
       count(*) filter (where status = 'cached') as cache_hits,
       count(*) filter (where status = 'error') as errors,
       sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
       round(sum(cost_usd), 4) as cost_usd,
       round(avg(cost_usd) filter (where status = 'ok'), 6) as avg_cost_per_call
from public.ai_usage_log group by 1, 2, 3 order by 1 desc, 2;

create view public.admin_usage_by_user with (security_invoker = true) as
select (l.created_at at time zone 'utc')::date as day, l.user_id, u.email,
       count(*) filter (where l.status in ('ok', 'refusal')) as ai_calls,
       round(sum(l.cost_usd), 4) as cost_usd
from public.ai_usage_log l left join auth.users u on u.id = l.user_id
group by 1, 2, 3 order by 1 desc, 5 desc;

revoke all on public.admin_usage_daily, public.admin_usage_by_user from anon, authenticated;
