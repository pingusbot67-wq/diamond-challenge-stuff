// Runs the real migration files on an in-memory Postgres (PGlite) with a tiny stand-in
// for Supabase's auth schema, then checks limits, the spending cap and the security rules.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
let db: PGlite;

const SUPABASE_STUB = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

async function asUser(id: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role;`);
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = new URL('../supabase/migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(f, dir), 'utf8'));
  }
  await db.exec(`grant usage on schema public to anon, authenticated, service_role;
    grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
    grant usage on all sequences in schema public to authenticated, service_role;`);
  await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@test.dev'), ('${B}', 'b@test.dev');`);
});

describe('database', () => {
  it('creates a profile automatically on sign-up', async () => {
    const r = await db.query(`select count(*)::int as n from public.profiles`);
    expect((r.rows[0] as { n: number }).n).toBe(2);
  });

  it('loads the nutrition table', async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from public.foods`);
    expect(r.rows[0].n).toBeGreaterThan(150);
  });

  it('users only see their own profile', async () => {
    const r = await asUser(A, `select id from public.profiles`);
    expect(r.rows).toEqual([{ id: A }]);
  });

  it('users cannot read the AI usage log or settings', async () => {
    const r = await asUser(A, `select * from public.ai_usage_log`);
    expect(r.rows).toEqual([]); // RLS on, no policy = nothing visible
    await expect(asUser(A, `select public.ai_reserve('${A}', 'scan', 'x')`)).rejects.toThrow();
  });

  it('users cannot create recipes directly', async () => {
    await expect(
      asUser(A, `insert into public.recipes (source, title, minutes, ingredients, steps, macros) values ('fridge','x',10,'[]','[]','{}')`),
    ).rejects.toThrow();
  });

  it('enforces the per-user daily limit', async () => {
    await db.exec(`update public.ai_settings set daily_limits = '{"scan": 2, "generate": 5}'`);
    const call = async () => ((await db.query<{ r: any }>(`select public.ai_reserve($1, 'scan', 'm') as r`, [A])).rows[0].r);
    expect((await call()).allowed).toBe(true);
    expect((await call()).allowed).toBe(true);
    const third = await call();
    expect(third.allowed).toBe(false);
    expect(third.reason).toBe('user_limit');
    // another user is unaffected
    const other = (await db.query<{ r: any }>(`select public.ai_reserve($1, 'scan', 'm') as r`, [B])).rows[0].r;
    expect(other.allowed).toBe(true);
  });

  it('errors do not use up the user limit', async () => {
    await db.exec(`update public.ai_usage_log set status = 'error' where user_id = '${A}' and feature = 'scan'`);
    const r = (await db.query<{ r: any }>(`select public.ai_reserve($1, 'scan', 'm') as r`, [A])).rows[0].r;
    expect(r.allowed).toBe(true);
  });

  it('turns AI off for everyone when the global daily cap is hit', async () => {
    await db.exec(`update public.ai_settings set global_daily_cap_usd = 0.01`);
    await db.exec(`insert into public.ai_usage_log (user_id, feature, model, status, cost_usd) values ('${B}', 'generate', 'm', 'ok', 0.02)`);
    const r = (await db.query<{ r: any }>(`select public.ai_reserve($1, 'generate', 'm') as r`, [A])).rows[0].r;
    expect(r).toMatchObject({ allowed: false, reason: 'global_cap' });
    await db.exec(`update public.ai_settings set global_daily_cap_usd = 3`);
  });

  it('master switch turns AI off', async () => {
    await db.exec(`update public.ai_settings set ai_enabled = false`);
    const r = (await db.query<{ r: any }>(`select public.ai_reserve($1, 'generate', 'm') as r`, [A])).rows[0].r;
    expect(r).toMatchObject({ allowed: false, reason: 'ai_disabled' });
    await db.exec(`update public.ai_settings set ai_enabled = true`);
  });

  it('saves and meal logs are private per user', async () => {
    const rec = await db.query<{ id: string }>(
      `insert into public.recipes (source, title, minutes, ingredients, steps, macros, owner_id) values ('fridge','Test',10,'[]','[]','{}', $1) returning id`,
      [A],
    );
    const id = rec.rows[0].id;
    await asUser(A, `insert into public.saved_recipes (user_id, recipe_id) values ($1, $2)`, [A, id]);
    await expect(asUser(B, `insert into public.saved_recipes (user_id, recipe_id) values ($1, $2)`, [A, id])).rejects.toThrow();
    expect((await asUser(B, `select * from public.saved_recipes`)).rows).toEqual([]);
    // B can still open the generated recipe itself (shared cache)
    expect((await asUser(B, `select title from public.recipes where id = $1`, [id])).rows).toEqual([{ title: 'Test' }]);
    await asUser(A, `insert into public.meal_logs (user_id, title, kcal, protein_g) values ($1, 'Lunch', 500, 40)`, [A]);
    expect((await asUser(B, `select * from public.meal_logs`)).rows).toEqual([]);
  });

  it('deleting a user removes their personal data but keeps anonymous cost history', async () => {
    await db.exec(`delete from auth.users where id = '${A}'`);
    const p = await db.query<{ n: number }>(`select count(*)::int as n from public.profiles where id = '${A}'`);
    expect(p.rows[0].n).toBe(0);
    const logs = await db.query<{ n: number }>(`select count(*)::int as n from public.ai_usage_log where user_id is null`);
    expect(logs.rows[0].n).toBeGreaterThan(0);
  });

  it('cost report views work', async () => {
    const r = await db.query(`select * from public.admin_usage_daily`);
    expect(r.rows.length).toBeGreaterThan(0);
  });
});
