import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** An error with a message that's safe to show the user. */
export class ApiError extends Error {
  constructor(message: string, public code = 'unknown') {
    super(message);
  }
}

/** Calls one of our server functions and turns any failure into a friendly ApiError. */
export async function callFunction<T>(name: string, body: object): Promise<T> {
  let res;
  try {
    res = await supabase.functions.invoke(name, { body });
  } catch {
    throw new ApiError('No connection. Check your internet and try again.', 'network');
  }
  if (res.error) {
    if (res.error instanceof FunctionsHttpError) {
      try {
        const payload = await res.error.context.json();
        if (payload?.error?.message) throw new ApiError(payload.error.message, payload.error.code);
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
      throw new ApiError('Something went wrong on our side. Please try again.', 'server');
    }
    throw new ApiError('No connection. Check your internet and try again.', 'network');
  }
  return res.data as T;
}

export function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    const m = (e as { message: string }).message;
    if (/network|fetch/i.test(m)) return 'No connection. Check your internet and try again.';
    return m;
  }
  return 'Something went wrong. Please try again.';
}
