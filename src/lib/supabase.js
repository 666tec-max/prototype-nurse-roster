import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://keqefvrtnpeomyrcgojc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlcWVmdnJ0bnBlb215cmNnb2pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNzE0NTEsImV4cCI6MjA4Nzc0NzQ1MX0.U02ARinXKREoNorKvq1Qz95NDE7ccLacgkiSqu2JW4I';

let currentClient = null;
let currentUserId = null;

/**
 * Get a Supabase client configured for a specific user.
 * The x-app-user-id header is read by the app_user_id() PostgreSQL function
 * used in all RLS policies to enforce data isolation.
 */
export function getSupabase(userId) {
  if (currentClient && currentUserId === userId) {
    return currentClient;
  }

  currentUserId = userId;
  currentClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        'x-app-user-id': userId || '',
      },
    },
  });

  return currentClient;
}

/**
 * Get an unauthenticated Supabase client (for login).
 */
export function getPublicSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Log an action to the audit_log table.
 */
export async function logAudit(userId, action, details = {}) {
  const supabase = getSupabase(userId);
  await supabase.from('audit_log').insert({
    user_id: userId,
    action,
    details,
  });
}
