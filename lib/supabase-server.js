import { createClient } from '@supabase/supabase-js';

export function supabaseServer() {
  // Service role for server only operations like admin checks
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function getAppUserByAuthId(authUserId) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from('users')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}