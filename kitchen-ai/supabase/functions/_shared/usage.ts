// Limits + usage logging. The DATABASE enforces limits (ai_reserve), never the app.
import type { SupabaseClient } from '@supabase/supabase-js';
import { FriendlyError, type UsageReport } from './claude.ts';

export async function reserve(admin: SupabaseClient, userId: string, feature: string, model: string): Promise<number> {
  const { data, error } = await admin.rpc('ai_reserve', { p_user: userId, p_feature: feature, p_model: model });
  if (error) throw new FriendlyError('server', 'Something went wrong. Please try again.', 500);
  const r = data as { allowed: boolean; reason?: string; log_id?: number; limit?: number };
  if (!r.allowed) {
    if (r.reason === 'user_limit')
      throw new FriendlyError('limit', `You've reached today's limit of ${r.limit} ${feature === 'scan' ? 'scans' : 'recipe generations'}. It resets at midnight UTC.`, 429);
    throw new FriendlyError('paused', 'AI features are paused for a little while. Saved recipes and cook mode still work.', 503);
  }
  return r.log_id!;
}

export function usageWriter(admin: SupabaseClient, logId: number) {
  return async (u: UsageReport) => {
    await admin
      .from('ai_usage_log')
      .update({ status: u.status, model: u.model, input_tokens: u.input_tokens, output_tokens: u.output_tokens, cost_usd: u.cost_usd, error: u.error ?? null })
      .eq('id', logId);
  };
}

export async function logCacheHit(admin: SupabaseClient, userId: string, feature: string) {
  await admin.from('ai_usage_log').insert({ user_id: userId, feature, status: 'cached' });
}
