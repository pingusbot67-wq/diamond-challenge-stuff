-- Kitchen AI — handy queries. Paste any block into Supabase → SQL Editor → Run.

-- 1) Cost per day, per feature, per model (includes average cost of ONE call)
select * from admin_usage_daily;

-- 2) Cost per user per day (who is using the most?)
select * from admin_usage_by_user;

-- 3) The real cost of one fridge scan and one recipe generation (averages from the log)
select feature, model,
       count(*)                          as calls,
       round(avg(input_tokens))          as avg_input_tokens,
       round(avg(output_tokens))         as avg_output_tokens,
       round(avg(cost_usd), 6)           as avg_cost_usd,
       round(avg(cost_usd) * 1000, 2)    as cost_per_1000_calls_usd
from ai_usage_log where status = 'ok'
group by 1, 2 order by 1, 2;

-- 4) Cache hit rate for recipe generation (cached = no AI cost)
select count(*) filter (where status = 'cached') as cache_hits,
       count(*) filter (where status = 'ok')     as ai_calls
from ai_usage_log where feature = 'generate';

-- 5) Recent errors / refusals (to spot problems)
select created_at, feature, model, status, error from ai_usage_log
where status in ('error', 'refusal') order by created_at desc limit 50;

-- ───────────── knobs ─────────────
-- Switch the fridge-scan model (after the Haiku vs Sonnet test). No redeploy needed.
-- update ai_settings set scan_model = 'claude-haiku-5-5';
-- update ai_settings set scan_model = 'claude-sonnet-5-5';

-- Change the global daily spending cap (all users combined, in US dollars, resets at midnight UTC)
-- update ai_settings set global_daily_cap_usd = 5;

-- Change per-user daily limits
-- update ai_settings set daily_limits = '{"scan": 15, "generate": 25}';

-- Emergency off switch for all AI features (saved recipes and cook mode keep working)
-- update ai_settings set ai_enabled = false;
