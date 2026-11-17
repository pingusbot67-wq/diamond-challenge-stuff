// One place that talks to Claude. Runs ONLY on the server (Supabase edge functions).
// The API key comes from a Supabase secret (ANTHROPIC_API_KEY) and never reaches the phone.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

export const TEXT_MODEL = 'claude-haiku-5-5';
export const SCAN_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5'] as const;

// USD per 1M tokens (Claude API list prices; Haiku price applies to prompts under 100K tokens, which ours always are)
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

/** An error whose message is safe and friendly to show in the app. */
export class FriendlyError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export type CallResult<T> = {
  data: T;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
};

export type UsageReport = {
  status: 'ok' | 'refusal' | 'error';
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  error?: string;
};

let client: Anthropic | null = null;
export function getClient(apiKey?: string): Anthropic {
  if (!client) client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  return client;
}

/**
 * Calls Claude with a strict JSON schema and returns the parsed result.
 * Always reports usage (even on refusal/error) so every cent shows up in the usage log.
 * Never throws anything but FriendlyError.
 */
export async function callStructured<S extends z.ZodType>(opts: {
  client: Anthropic;
  model: string;
  system: string;
  content: Anthropic.ContentBlockParam[] | string;
  schema: S;
  maxTokens: number;
  onUsage: (u: UsageReport) => Promise<void> | void;
}): Promise<CallResult<z.infer<S>>> {
  const format = zodOutputFormat(opts.schema);
  let msg: Anthropic.Message;
  try {
    msg = await opts.client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: 'user', content: opts.content }],
      // effort "low" = simple task, fewer thinking tokens = cheaper. format = guaranteed JSON shape.
      output_config: { effort: 'low', format },
    });
  } catch (err) {
    await opts.onUsage({ status: 'error', model: opts.model, input_tokens: 0, output_tokens: 0, cost_usd: 0, error: describeError(err) });
    throw toFriendly(err);
  }

  const input_tokens = msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
  const output_tokens = msg.usage.output_tokens;
  const cost_usd = estimateCostUsd(opts.model, input_tokens, output_tokens);
  const base = { model: opts.model, input_tokens, output_tokens, cost_usd };

  if (msg.stop_reason === 'refusal') {
    await opts.onUsage({ ...base, status: 'refusal', error: `refusal: ${msg.stop_details?.category ?? 'unknown'}` });
    throw new FriendlyError('refusal', "We couldn't work with that one. Try a different photo or different ingredients.", 422);
  }
  if (msg.stop_reason === 'max_tokens') {
    await opts.onUsage({ ...base, status: 'error', error: 'max_tokens' });
    throw new FriendlyError('too_long', 'That took more space than expected. Please try again with fewer items.', 502);
  }

  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
  let data: z.infer<S>;
  try {
    data = format.parse(text) as z.infer<S>;
  } catch (err) {
    await opts.onUsage({ ...base, status: 'error', error: `parse: ${describeError(err)}` });
    throw new FriendlyError('bad_output', 'Something went wrong on our side. Please try again.', 502);
  }
  await opts.onUsage({ ...base, status: 'ok' });
  return { data, ...base };
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `${err.status ?? ''} ${err.name}: ${err.message}`.slice(0, 500);
  return String(err).slice(0, 500);
}

function toFriendly(err: unknown): FriendlyError {
  if (err instanceof Anthropic.RateLimitError) return new FriendlyError('busy', 'We’re a bit busy right now. Please try again in a minute.', 503);
  if (err instanceof Anthropic.APIConnectionError) return new FriendlyError('network', 'Couldn’t reach our AI service. Please try again.', 503);
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return new FriendlyError('config', 'AI features are temporarily unavailable.', 503);
  if (err instanceof Anthropic.BadRequestError) return new FriendlyError('bad_request', 'We couldn’t process that request. Please try again.', 400);
  if (err instanceof Anthropic.InternalServerError) return new FriendlyError('ai_down', 'Our AI service is having a moment. Please try again shortly.', 503);
  return new FriendlyError('unknown', 'Something went wrong. Please try again.', 500);
}
