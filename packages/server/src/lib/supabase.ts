import { createClient } from '@supabase/supabase-js';
import './env';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_ANON_KEY is not defined in environment variables.');
}

/**
 * Admin client — used by background scripts and system operations.
 *
 * REQUIRES SUPABASE_SERVICE_ROLE_KEY. This key bypasses Row-Level Security (RLS).
 * If the key is missing, the admin client will throw at call-time rather than
 * silently succeeding with an empty result set (the original RLS silent-failure bug).
 *
 * The anon-key fallback has been intentionally removed. A missing service key
 * in a fresh environment (staging, CI, new clone) should fail loudly, not quietly.
 */
export const supabaseAdmin = (() => {
  if (!supabaseServiceKey) {
    // Return a proxy that throws a clear error on first use rather than crashing at module load,
    // so that routes that only use getSupabaseClient() (user-scoped) aren't affected.
    const handler: ProxyHandler<object> = {
      get(_target, prop) {
        if (prop === 'then') return undefined; // Allow promise checks to work
        return () => {
          throw new Error(
            '[CONFIG ERROR] supabaseAdmin requires SUPABASE_SERVICE_ROLE_KEY to be set in your .env file.\n' +
            'This client is used by background/admin scripts (reindex, etc.) to bypass RLS.\n' +
            'Set SUPABASE_SERVICE_ROLE_KEY in packages/server/.env and restart.'
          );
        };
      }
    };
    console.error(
      '[WARNING] SUPABASE_SERVICE_ROLE_KEY is not set. ' +
      'supabaseAdmin calls will throw at runtime. ' +
      'Background scripts (reindex) will not work until this is configured.'
    );
    return new Proxy({}, handler) as ReturnType<typeof createClient>;
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  });
})();

/**
 * Returns a Supabase client. If an Authorization header is provided,
 * it returns a client that forwards the user's token so Row Level Security (RLS) policies work.
 */
export const getSupabaseClient = (authHeader?: string) => {
  if (!authHeader) {
    return supabaseAdmin;
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
};
