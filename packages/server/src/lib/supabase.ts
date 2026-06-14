import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Resolve environment variables from the project root .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Warning: SUPABASE_URL or SUPABASE_ANON_KEY is not defined in environment variables.');
}

// Admin/System client
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey);

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
