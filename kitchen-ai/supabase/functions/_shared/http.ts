// Request helpers for the edge functions: CORS, JSON replies, "who is calling?".
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { FriendlyError } from './claude.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function env(name: string): string {
  // deno-lint-ignore no-explicit-any
  const v = (globalThis as any).Deno?.env.get(name);
  if (!v) throw new FriendlyError('config', 'Server is not configured yet.', 500);
  return v;
}

export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

/** Verifies the caller's login token. Throws 401 if missing/invalid. */
export async function requireUser(req: Request): Promise<User> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new FriendlyError('auth', 'Please sign in again.', 401);
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new FriendlyError('auth', 'Please sign in again.', 401);
  return data.user;
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: { code: 'method', message: 'Use POST.' } }, 405);
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof FriendlyError) return json({ error: { code: err.code, message: err.message } }, err.status);
      console.error(err);
      return json({ error: { code: 'unknown', message: 'Something went wrong. Please try again.' } }, 500);
    }
  };
}

export function anthropicKey(): string {
  return env('ANTHROPIC_API_KEY');
}
