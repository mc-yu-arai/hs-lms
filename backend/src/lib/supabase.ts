import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";

// service_role相当のSecret Keyを使うサーバー専用クライアント。RLSをバイパスするため、
// クライアント（フロントエンド）には絶対に渡さないこと。
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ユーザー資格情報の検証（signInWithPassword等）に使うクライアント。
// Publishable Keyのみを使用し、RLSの制約を受ける想定。
export const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
