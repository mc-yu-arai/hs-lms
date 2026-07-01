import { supabaseAdmin } from "../lib/supabase";

export interface AppUser {
  id: string;
  email: string;
  last_name: string;
  first_name: string;
  role: "learner" | "admin" | "super_admin";
  department: string | null;
  hire_date: string | null;
  is_active: boolean;
  last_login_at: string | null;
  totp_secret: string | null;
  totp_enabled: boolean;
  failed_login_count: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  return data as AppUser | null;
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const { data, error } = await supabaseAdmin.from("users").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as AppUser | null;
}

export async function recordFailedLogin(userId: string, maxAttempts: number, lockMinutes: number) {
  const user = await findUserById(userId);
  if (!user) return;

  const nextCount = user.failed_login_count + 1;
  const shouldLock = nextCount >= maxAttempts;

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      failed_login_count: shouldLock ? 0 : nextCount,
      locked_until: shouldLock ? new Date(Date.now() + lockMinutes * 60_000).toISOString() : user.locked_until,
    })
    .eq("id", userId);

  if (error) throw error;
}

export async function resetFailedLoginCount(userId: string) {
  const { error } = await supabaseAdmin.from("users").update({ failed_login_count: 0, locked_until: null }).eq("id", userId);
  if (error) throw error;
}

export async function touchLastLogin(userId: string) {
  const { error } = await supabaseAdmin
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}
